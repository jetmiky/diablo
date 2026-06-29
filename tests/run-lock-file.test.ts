import { test, expect, describe, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireRunLock,
  RunLockedError,
} from "../src/adapters/run-lock-file.ts";
import { serializeLockRecord } from "../src/domain/run-lock.ts";

// Real-filesystem integration test for the lock adapter (the pure policy is
// covered in run-lock.test.ts). Validates the actual file effects + the
// process.kill liveness probe that decides staleness.

const dirs: string[] = [];
async function freshDiabloDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "diablo-lock-"));
  dirs.push(d);
  return d;
}

afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

describe("acquireRunLock — real fs", () => {
  test("acquires and writes a lockfile owned by this process", async () => {
    const diabloDir = await freshDiabloDir();
    const handle = await acquireRunLock(diabloDir, "feat-x");

    const raw = await readFile(join(diabloDir, "feat-x", "run.lock"), "utf8");
    expect(JSON.parse(raw).pid).toBe(process.pid);

    await handle.release();
  });

  test("a second acquire while the lock is held (live owner) throws RunLockedError", async () => {
    const diabloDir = await freshDiabloDir();
    const first = await acquireRunLock(diabloDir, "feat-x");

    // The held lock is owned by THIS (alive) process, so a second acquire blocks.
    await expect(acquireRunLock(diabloDir, "feat-x")).rejects.toThrow(RunLockedError);

    await first.release();
  });

  test("release removes the lockfile so the next run can acquire", async () => {
    const diabloDir = await freshDiabloDir();
    const first = await acquireRunLock(diabloDir, "feat-x");
    await first.release();

    // Now free — a fresh acquire succeeds.
    const second = await acquireRunLock(diabloDir, "feat-x");
    await second.release();
  });

  test("a STALE lock (dead owner pid) is reclaimed, not blocked", async () => {
    const diabloDir = await freshDiabloDir();
    const lockFile = join(diabloDir, "feat-x", "run.lock");
    await mkdir(join(diabloDir, "feat-x"), { recursive: true });

    // pid 2^31-1 is effectively never a live process — simulate a crashed run.
    const deadPid = 2147483646;
    await writeFile(
      lockFile,
      serializeLockRecord({ pid: deadPid, startedAt: "2026-06-29T00:00:00.000Z" }),
      "utf8",
    );

    // The dead owner means the lock is stale → acquire reclaims it.
    const handle = await acquireRunLock(diabloDir, "feat-x");
    const raw = await readFile(lockFile, "utf8");
    expect(JSON.parse(raw).pid).toBe(process.pid); // we now own it

    await handle.release();
  });

  test("a corrupt lockfile is treated as no lock (never wedges the issue)", async () => {
    const diabloDir = await freshDiabloDir();
    const lockFile = join(diabloDir, "feat-x", "run.lock");
    await mkdir(join(diabloDir, "feat-x"), { recursive: true });
    await writeFile(lockFile, "{ not valid json", "utf8");

    const handle = await acquireRunLock(diabloDir, "feat-x");
    expect(JSON.parse(await readFile(lockFile, "utf8")).pid).toBe(process.pid);

    await handle.release();
  });

  test("different issues acquire independently (per-issue, not global)", async () => {
    const diabloDir = await freshDiabloDir();
    const a = await acquireRunLock(diabloDir, "feat-a");
    // A different issue is unaffected by feat-a's lock.
    const b = await acquireRunLock(diabloDir, "feat-b");

    await a.release();
    await b.release();
  });
});
