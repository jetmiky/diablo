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

  // --- issue #1: a non-zero gate that failed ONLY because there is nothing to
  // check yet (empty TDD scaffold stage) is NOT a real failure (ADR 0004). ---

  test("tsc TS18003 'no inputs' on an empty source tree does NOT fail the gate (LLM pass)", () => {
    const gates: GateOutcome[] = [
      {
        command: "bun run typecheck",
        exitCode: 2,
        output:
          "error TS18003: No inputs were found in config file '/p/tsconfig.json'. " +
          `Specified 'include' paths were '["**/*"]'.`,
      },
    ];
    expect(combineVerdict("pass", "implementation", gates).verdict).toBe("pass");
  });

  test("bun 'No tests found!' on an empty suite does NOT fail the gate (LLM pass)", () => {
    const gates: GateOutcome[] = [
      { command: "bun test", exitCode: 1, output: "bun test v1.3\nNo tests found!" },
    ];
    expect(combineVerdict("pass", "implementation", gates).verdict).toBe("pass");
  });

  test("a REAL type error still FAILs even though the carve-out exists (scoped to empty-state only)", () => {
    const gates: GateOutcome[] = [
      {
        command: "bun run typecheck",
        exitCode: 2,
        output: "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      },
    ];
    const result = combineVerdict("pass", "implementation", gates);
    expect(result.verdict).toBe("fail");
    expect(result.category).toBe("implementation");
  });

  test("the empty-state carve-out cannot upgrade a non-pass LLM verdict", () => {
    // The carve-out only neutralises the MEASURED exit; the LLM verdict still
    // has its downgrade power (a FAIL/none verdict fails the stage).
    const gates: GateOutcome[] = [
      { command: "bun run typecheck", exitCode: 2, output: "error TS18003: No inputs were found." },
    ];
    expect(combineVerdict("fail", "implementation", gates).verdict).toBe("fail");
    expect(combineVerdict("none", "implementation", gates).verdict).toBe("fail");
  });

  test("a non-zero gate with no captured output is still a failure (no false carve-out)", () => {
    // Back-compat: outcomes without an `output` field (older callers) behave
    // exactly as before — a non-zero exit fails.
    const gates: GateOutcome[] = [{ command: "bun test", exitCode: 1 }];
    expect(combineVerdict("pass", "implementation", gates).verdict).toBe("fail");
  });

  test("among multiple gates, an empty-state non-zero is ignored but a real failure still FAILs", () => {
    const gates: GateOutcome[] = [
      { command: "bun run typecheck", exitCode: 2, output: "error TS18003: No inputs were found." },
      { command: "bun test", exitCode: 1, output: "1 fail\nexpect(received).toBe(expected)" },
    ];
    const result = combineVerdict("pass", "implementation", gates);
    expect(result.verdict).toBe("fail");
    expect(result.reason).toMatch(/bun test/);
  });
});

