/**
 * Live per-issue run lock over the real filesystem and OS process table. The
 * lockfile lives under the gitignored .diablo/<issue>/ runtime dir, so it is
 * never committed and sits beside the issue's other machine state (state.json).
 *
 * The acquire/release/stale POLICY is the pure decideLock in domain/run-lock.ts;
 * this adapter only supplies real readings (read+parse the lockfile, check
 * liveness via process.kill(pid, 0)) and performs the file effects. Validated by
 * the CLI run path, not unit tests — the testable decision lives in the domain.
 *
 * Liveness note: process.kill(pid, 0) sends no signal; it throws ESRCH when no
 * such process exists (dead → reclaimable) and EPERM when the process exists but
 * is owned by another user (alive → still locked). Both "exists" outcomes mean
 * the owner is alive.
 */
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  decideLock,
  parseLockRecord,
  serializeLockRecord,
  type LockRecord,
} from "../domain/run-lock.ts";

/** Thrown when another live run already holds this issue's lock. */
export class RunLockedError extends Error {
  constructor(
    readonly issue: string,
    readonly owner: LockRecord,
  ) {
    super(
      `issue ${issue} is already being run (pid ${owner.pid}, started ${owner.startedAt}). ` +
        `If that process is gone, the stale lock is reclaimed automatically on the next run.`,
    );
    this.name = "RunLockedError";
  }
}

/** A handle that releases the lock it acquired. release() is best-effort and idempotent. */
export interface RunLockHandle {
  release(): Promise<void>;
}

function lockPath(diabloDir: string, issue: string): string {
  return `${diabloDir}/${issue}/run.lock`;
}

/** True if a process with this pid exists (alive); false only when it is gone. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but we can't signal it → still alive.
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    // ESRCH (or anything else): no such process → dead.
    return false;
  }
}

/**
 * Acquire the per-issue lock, reclaiming a stale (dead-owner) lock if present.
 * Throws RunLockedError when a live run already holds it — the caller should
 * exit non-zero WITHOUT touching the worktree. Returns a handle whose release()
 * removes the lockfile (call on completion, halt, or crash).
 */
export async function acquireRunLock(
  diabloDir: string,
  issue: string,
  now: () => Date = () => new Date(),
): Promise<RunLockHandle> {
  const path = lockPath(diabloDir, issue);

  let existing: LockRecord | null = null;
  try {
    existing = parseLockRecord(await readFile(path, "utf8"));
  } catch {
    existing = null; // no lockfile (or unreadable) → treat as absent
  }

  const ownerAlive = existing !== null && isProcessAlive(existing.pid);
  const decision = decideLock({ existing, ownerAlive });

  if (decision.action === "blocked") {
    throw new RunLockedError(issue, decision.owner);
  }

  const record: LockRecord = { pid: process.pid, startedAt: now().toISOString() };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeLockRecord(record), "utf8");

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      // Only remove a lockfile we still own — guards against deleting a lock a
      // reclaiming run took over after we were presumed dead.
      try {
        const current = parseLockRecord(await readFile(path, "utf8"));
        if (current && current.pid === record.pid && current.startedAt === record.startedAt) {
          await rm(path, { force: true });
        }
      } catch {
        // Already gone or unreadable — nothing to release. Best-effort.
      }
    },
  };
}
