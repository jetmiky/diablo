import { describe, expect, test } from "bun:test";
import { combineVerdict, type GateOutcome } from "../src/domain/measured-verdict.ts";

describe("combineVerdict", () => {
  test("LLM pass + all gates pass → pass", () => {
    const gates: GateOutcome[] = [
      { command: "bun run typecheck", exitCode: 0 },
      { command: "bun test", exitCode: 0 },
    ];
    expect(combineVerdict("pass", "implementation", gates).verdict).toBe("pass");
  });

  test("LLM pass but a gate FAILS → fail (measured exit overrides the self-report)", () => {
    const gates: GateOutcome[] = [
      { command: "bun run typecheck", exitCode: 0 },
      { command: "bun test", exitCode: 1 },
    ];
    const result = combineVerdict("pass", "implementation", gates);
    expect(result.verdict).toBe("fail");
    // The failing command is named so the worker retry has actionable feedback.
    expect(result.reason).toMatch(/bun test/);
    expect(result.reason).toMatch(/exit 1|exit code 1|non-zero/i);
  });

  test("LLM fail → fail even when all gates pass (verifier judged the criteria unmet)", () => {
    const gates: GateOutcome[] = [{ command: "bun test", exitCode: 0 }];
    expect(combineVerdict("fail", "implementation", gates).verdict).toBe("fail");
  });

  test("LLM none (silent verifier) → fail even with passing gates", () => {
    const gates: GateOutcome[] = [{ command: "bun test", exitCode: 0 }];
    expect(combineVerdict("none", "implementation", gates).verdict).toBe("fail");
  });

  test("no gates configured → falls back to the LLM verdict (pass stays pass)", () => {
    expect(combineVerdict("pass", "implementation", []).verdict).toBe("pass");
    expect(combineVerdict("fail", "implementation", []).verdict).toBe("fail");
  });

  test("a measured gate failure is an implementation fault (retryable), overriding even an LLM plan-fail", () => {
    const gates: GateOutcome[] = [{ command: "bun test", exitCode: 2 }];
    // Even if the LLM blamed the plan, a failing gate is a concrete code fault.
    const result = combineVerdict("pass", "plan", gates);
    expect(result.verdict).toBe("fail");
    expect(result.category).toBe("implementation");
  });

  test("gates pass but LLM says FAIL [plan] → preserves the plan category (halts, never auto-retries)", () => {
    const gates: GateOutcome[] = [{ command: "bun test", exitCode: 0 }];
    const result = combineVerdict("fail", "plan", gates);
    expect(result.verdict).toBe("fail");
    expect(result.category).toBe("plan"); // plan routing survives a passing gate
  });

  test("gates pass but LLM silent (none) → implementation category (a silent verifier is not a plan defect)", () => {
    const result = combineVerdict("none", "plan", [{ command: "bun test", exitCode: 0 }]);
    expect(result.category).toBe("implementation");
  });

  test("reports whether a deterministic gate actually ran (for the loud-degrade notice)", () => {
    expect(combineVerdict("pass", "implementation", []).measured).toBe(false);
    expect(combineVerdict("pass", "implementation", [{ command: "bun test", exitCode: 0 }]).measured).toBe(true);
  });
});

