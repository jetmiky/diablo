import { describe, expect, test } from "bun:test";
import {
  classifyRunSuccess,
  classifyRunError,
  isRethrow,
} from "../src/app/run-outcome.ts";
import { GateDeclinedError } from "../src/ports/gate.ts";
import { VerificationFailedError, StepTimeoutError } from "../src/app/run-step.ts";
import { PlanParseError } from "../src/domain/plan.ts";
import { RunBudgetExceededError } from "../src/domain/run-budget.ts";

describe("classifyRunSuccess", () => {
  test("done with a commit: exit 0, no status to persist, final-commit message", () => {
    const view = classifyRunSuccess("issue", "billing", { status: "done" }, "abcdef1234567890");
    expect(view.exitCode).toBe(0);
    // finalizeIssue already persisted the status on the success path.
    expect(view.status).toBeNull();
    expect(view.message).toBe(
      `\n✅ issue billing complete — final commit abcdef1234 — status: done\n`,
    );
  });

  test("done without a commit: omits the final-commit clause", () => {
    const view = classifyRunSuccess("refactor of", "cli", { status: "done" }, undefined);
    expect(view.exitCode).toBe(0);
    expect(view.status).toBeNull();
    expect(view.message).toBe(`\n✅ refactor of cli complete — status: done\n`);
  });

  test("done-gate held (needs-human): exit 0, no status to persist, lists unmet criteria", () => {
    const view = classifyRunSuccess(
      "issue",
      "billing",
      { status: "needs-human", reason: "1 of 2 criteria unmet", unmet: ["tests pass", "docs updated"] },
      "abcdef1234567890",
    );
    expect(view.exitCode).toBe(0);
    expect(view.status).toBeNull();
    expect(view.message).toBe(
      `\n⚠️  issue billing verified PASS but the done gate held — status: needs-human.\n` +
        `   1 of 2 criteria unmet\n` +
        `   - unmet: tests pass\n` +
        `   - unmet: docs updated\n`,
    );
  });
});

describe("classifyRunError", () => {
  test("GateDeclinedError: a clean user halt — exit 0, persist needs-human", () => {
    const err = new GateDeclinedError("billing", "stage-1", "worker");
    const c = classifyRunError(err, "issue", "billing");
    expect(isRethrow(c)).toBe(false);
    if (isRethrow(c)) throw new Error("unreachable");
    expect(c.exitCode).toBe(0);
    expect(c.status).toBe("needs-human");
    expect(c.message).toBe(`\n⏸  ${err.message} — status: needs-human\n`);
  });

  test("VerificationFailedError: exit 1, persist needs-human", () => {
    const err = new VerificationFailedError("billing", "stage-1", "VERDICT: FAIL");
    const c = classifyRunError(err, "issue", "billing");
    if (isRethrow(c)) throw new Error("unreachable");
    expect(c.exitCode).toBe(1);
    expect(c.status).toBe("needs-human");
    expect(c.message).toBe(
      `\n⚠️  issue billing halted at verification — status: needs-human.\n`,
    );
  });

  test("PlanParseError: exit 1, persist needs-human, includes the diagnostic", () => {
    const err = new PlanParseError("missing stage header");
    const c = classifyRunError(err, "issue", "billing");
    if (isRethrow(c)) throw new Error("unreachable");
    expect(c.exitCode).toBe(1);
    expect(c.status).toBe("needs-human");
    expect(c.message).toBe(
      `\n⚠️  issue billing halted: the plan could not be parsed after a re-ask — status: needs-human.\n` +
        `   missing stage header\n`,
    );
  });

  test("StepTimeoutError: exit 1, persist needs-human, includes the error message", () => {
    const err = new StepTimeoutError("billing", "stage-1");
    const c = classifyRunError(err, "issue", "billing");
    if (isRethrow(c)) throw new Error("unreachable");
    expect(c.exitCode).toBe(1);
    expect(c.status).toBe("needs-human");
    expect(c.message).toBe(
      `\n⚠️  issue billing halted: a step exceeded its deadline and was aborted — status: needs-human.\n` +
        `   ${err.message}\n`,
    );
  });

  test("RunBudgetExceededError: exit 1, persist needs-human, includes the error message", () => {
    const err = new RunBudgetExceededError("max steps (200) reached");
    const c = classifyRunError(err, "refactor of", "cli");
    if (isRethrow(c)) throw new Error("unreachable");
    expect(c.exitCode).toBe(1);
    expect(c.status).toBe("needs-human");
    expect(c.message).toBe(
      `\n⚠️  refactor of cli halted: run budget exceeded — status: needs-human.\n` +
        `   ${err.message}\n`,
    );
  });

  test("an unknown error signals rethrow", () => {
    const c = classifyRunError(new Error("disk on fire"), "issue", "billing");
    expect(isRethrow(c)).toBe(true);
  });

  test("noun is threaded into halt messages (refactor vs issue)", () => {
    const err = new VerificationFailedError("cli", "stage-2", "VERDICT: FAIL");
    const c = classifyRunError(err, "refactor of", "cli");
    if (isRethrow(c)) throw new Error("unreachable");
    expect(c.message).toContain("refactor of cli halted at verification");
  });
});
