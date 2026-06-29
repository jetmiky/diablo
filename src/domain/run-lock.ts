/**
 * RunLock is the per-issue concurrency guard for an unattended engine: it stops
 * a second `diablo run <same-issue>` from racing the first into the same
 * worktree and branch, where interleaved commits and progress writes would
 * corrupt each other's state. Different issues are unaffected — the lock is
 * per-issue, not global.
 *
 * The POLICY lives here as a pure function (decideLock) over an injected view of
 * the world: the existing lock record (if any) and whether its owning process
 * is still alive. That keeps the acquire / blocked / reclaim decision fully
 * unit-tested against fakes — no real files, pids, or timers. The live adapter
 * (acquireRunLock) supplies the real readings: read the lockfile, parse it,
 * check liveness via `process.kill(pid, 0)`, then act on the verdict.
 *
 * Staleness is by LIVENESS, not a timeout: a crashed run's owner pid is gone, so
 * its lock is reclaimable immediately; a long-but-alive run keeps its lock for
 * as long as it actually runs. A corrupt/unparseable lockfile is treated as no
 * lock (existing=null) so garbage can never wedge an issue permanently.
 */

export interface LockRecord {
  /** OS process id of the run that holds the lock. */
  pid: number;
  /** ISO-8601 timestamp the lock was acquired (for the "already running" message). */
  startedAt: string;
}

export interface LockWorld {
  /** The current lock record, or null if absent/corrupt/unparseable. */
  existing: LockRecord | null;
  /** Whether the existing record's owning process is still alive. Meaningless when existing is null. */
  ownerAlive: boolean;
}

export type LockDecision =
  | { action: "acquire"; reclaimed: boolean }
  | { action: "blocked"; owner: LockRecord };

/**
 * Pure lock policy. Acquire when there is no live owner (fresh, or reclaiming a
 * dead owner's stale lock); block when a live owner already holds it.
 */
export function decideLock(world: LockWorld): LockDecision {
  if (world.existing === null) {
    return { action: "acquire", reclaimed: false };
  }
  if (world.ownerAlive) {
    return { action: "blocked", owner: world.existing };
  }
  // Owner process is gone — the lock is stale; reclaim it.
  return { action: "acquire", reclaimed: true };
}

export function serializeLockRecord(rec: LockRecord): string {
  return JSON.stringify({ pid: rec.pid, startedAt: rec.startedAt }, null, 2) + "\n";
}

/** Parses a lockfile's contents to a record, or null if missing/corrupt/incomplete. */
export function parseLockRecord(content: string): LockRecord | null {
  try {
    const json = JSON.parse(content);
    if (
      json &&
      typeof json === "object" &&
      typeof json.pid === "number" &&
      typeof json.startedAt === "string"
    ) {
      return { pid: json.pid, startedAt: json.startedAt };
    }
    return null;
  } catch {
    return null;
  }
}
