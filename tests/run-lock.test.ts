import { test, expect, describe } from "bun:test";
import {
  decideLock,
  parseLockRecord,
  serializeLockRecord,
  type LockRecord,
} from "../src/domain/run-lock.ts";

describe("decideLock — acquire / blocked / reclaim", () => {
  const me: LockRecord = { pid: 1234, startedAt: "2026-06-29T16:00:00.000Z" };

  test("no existing lock → acquire", () => {
    const d = decideLock({ existing: null, ownerAlive: false });
    expect(d.action).toBe("acquire");
    if (d.action === "acquire") expect(d.reclaimed).toBe(false);
  });

  test("existing lock whose owner is still alive → blocked, surfacing the owner", () => {
    const owner: LockRecord = { pid: 999, startedAt: "2026-06-29T15:55:00.000Z" };
    const d = decideLock({ existing: owner, ownerAlive: true });
    expect(d.action).toBe("blocked");
    if (d.action === "blocked") expect(d.owner).toEqual(owner);
  });

  test("existing lock whose owner is dead → reclaim (acquire the stale lock)", () => {
    const dead: LockRecord = { pid: 999, startedAt: "2026-06-29T15:55:00.000Z" };
    const d = decideLock({ existing: dead, ownerAlive: false });
    expect(d.action).toBe("acquire");
    if (d.action === "acquire") expect(d.reclaimed).toBe(true);
  });

  test("an unparseable/corrupt lock (existing=null from a failed parse) → acquire, not block forever", () => {
    // The adapter maps a corrupt lockfile to existing=null so a garbage file
    // can never wedge the issue permanently.
    const d = decideLock({ existing: null, ownerAlive: true });
    expect(d.action).toBe("acquire");
  });
});

describe("lock record serialization", () => {
  test("round-trips pid and startedAt through serialize → parse", () => {
    const rec: LockRecord = { pid: 4242, startedAt: "2026-06-29T16:10:00.000Z" };
    const parsed = parseLockRecord(serializeLockRecord(rec));
    expect(parsed).toEqual(rec);
  });

  test("serialized form is pretty JSON ending in a newline", () => {
    const out = serializeLockRecord({ pid: 7, startedAt: "2026-06-29T16:10:00.000Z" });
    expect(out.endsWith("\n")).toBe(true);
    expect(JSON.parse(out)).toEqual({ pid: 7, startedAt: "2026-06-29T16:10:00.000Z" });
  });

  test("malformed JSON parses to null (corrupt lock is ignored, never throws)", () => {
    expect(parseLockRecord("{not json")).toBeNull();
  });

  test("a JSON object missing pid or startedAt parses to null", () => {
    expect(parseLockRecord(JSON.stringify({ pid: 7 }))).toBeNull();
    expect(parseLockRecord(JSON.stringify({ startedAt: "x" }))).toBeNull();
    expect(parseLockRecord(JSON.stringify({ pid: "7", startedAt: "x" }))).toBeNull();
  });
});
