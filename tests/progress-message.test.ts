import { describe, expect, test } from "bun:test";
import { formatEvent } from "../src/domain/progress-message.ts";

/**
 * formatEvent turns a progress event into a one-line human message (markdown).
 * Shared by the stdout and Telegram sinks; the Telegram adapter additionally
 * runs it through renderTelegramHtml. Pure, unit-tested.
 */
describe("formatEvent", () => {
  test("stage-started names the stage and its position", () => {
    const msg = formatEvent({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 3 });
    expect(msg).toContain("Scaffold");
    expect(msg).toContain("1/3");
  });

  test("committed shows a short sha", () => {
    const msg = formatEvent({ kind: "committed", stage: "stage-1", sha: "a1b2c3d4e5f6a7b8" });
    expect(msg).toContain("a1b2c3d");
  });

  test("verdict reflects pass/fail", () => {
    expect(formatEvent({ kind: "verdict", stage: "stage-1", verdict: "pass" }).toLowerCase()).toContain("pass");
    expect(formatEvent({ kind: "verdict", stage: "stage-1", verdict: "fail" }).toLowerCase()).toContain("fail");
  });

  test("waiting-for-approval is marked as idle/awaiting", () => {
    const msg = formatEvent({ kind: "waiting-for-approval", stage: "stage-2" });
    expect(msg.toLowerCase()).toMatch(/await|approval|idle/);
  });

  test("done shows the final commit", () => {
    expect(formatEvent({ kind: "done", commit: "f".repeat(40) })).toContain("f".repeat(7));
  });

  test("halted shows the reason", () => {
    expect(formatEvent({ kind: "halted", reason: "FAIL [plan]" })).toContain("FAIL [plan]");
  });

  test("retry shows the attempt number", () => {
    expect(formatEvent({ kind: "retry", stage: "stage-1", attempt: 2 })).toContain("2");
  });
});
