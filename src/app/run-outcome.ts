/**
 * run-outcome is the pure verdict layer for a run: it maps a completed run (or
 * the typed error that halted it) into a CLI-facing view — the lifecycle status
 * to persist, the process exit code, and the human-facing message. Extracted
 * from the CLI composition root so the run's most consequential branching (its
 * halt states) is a directly-tested module rather than untested logic trapped
 * in main.ts's try/catch.
 *
 * Pure (no I/O): the caller owns persistence (writeStatus) and output (write).
 * `status` is the lifecycle status to persist, or null when the success path
 * has already persisted it (finalizeIssue does this for a completed run).
 */
import type { IssueStatus } from "../domain/issue-status.ts";
import type { DoneDecision } from "../domain/done-gate.ts";
import { GateDeclinedError } from "../ports/gate.ts";
import { VerificationFailedError, StepTimeoutError } from "./run-step.ts";
import { PlanParseError } from "../domain/plan.ts";
import { RunBudgetExceededError } from "../domain/run-budget.ts";

/** The CLI-facing view of a run outcome: what to persist, exit with, and print. */
export interface RunOutcomeView {
  /** Lifecycle status to persist, or null when already persisted (success path). */
  status: IssueStatus | null;
  /** Process exit code. */
  exitCode: number;
  /** Human-facing message to write to stdout. */
  message: string;
}

/** Marker the caller checks: an unrecognized error must propagate unchanged. */
export interface Rethrow {
  rethrow: true;
}

export function isRethrow(c: RunOutcomeView | Rethrow): c is Rethrow {
  return (c as Rethrow).rethrow === true;
}

/**
 * Classifies a SUCCESSFUL run (runDiablo returned, final verification passed).
 * The done gate's decision (done vs needs-human) shapes the message; either way
 * the status was already persisted by finalizeIssue, so `status` is null and the
 * exit code is 0 (a held done-gate is a clean, expected outcome, not a failure).
 */
export function classifyRunSuccess(
  noun: string,
  target: string,
  decision: DoneDecision,
  commit: string | undefined,
): RunOutcomeView {
  if (decision.status === "done") {
    const commitClause = commit ? ` — final commit ${commit.slice(0, 10)}` : "";
    return {
      status: null,
      exitCode: 0,
      message: `\n✅ ${noun} ${target} complete${commitClause} — status: done\n`,
    };
  }

  return {
    status: null,
    exitCode: 0,
    message:
      `\n⚠️  ${noun} ${target} verified PASS but the done gate held — status: needs-human.\n` +
      `   ${decision.reason}\n` +
      decision.unmet.map((c) => `   - unmet: ${c}`).join("\n") +
      `\n`,
  };
}

/**
 * Classifies a run that threw. Each typed halt maps to its (status, exitCode,
 * message); an unrecognized error returns a Rethrow marker so the caller
 * propagates it unchanged (a real crash must not be swallowed as needs-human).
 */
export function classifyRunError(
  err: unknown,
  noun: string,
  target: string,
): RunOutcomeView | Rethrow {
  if (err instanceof GateDeclinedError) {
    // A human declined at an approval gate — a clean halt awaiting them.
    return {
      status: "needs-human",
      exitCode: 0,
      message: `\n⏸  ${err.message} — status: needs-human\n`,
    };
  }

  if (err instanceof VerificationFailedError) {
    return {
      status: "needs-human",
      exitCode: 1,
      message: `\n⚠️  ${noun} ${target} halted at verification — status: needs-human.\n`,
    };
  }

  if (err instanceof PlanParseError) {
    // The planner's plan could not be parsed even after one bounded re-ask.
    return {
      status: "needs-human",
      exitCode: 1,
      message:
        `\n⚠️  ${noun} ${target} halted: the plan could not be parsed after a re-ask — status: needs-human.\n` +
        `   ${err.diagnostic}\n`,
    };
  }

  if (err instanceof StepTimeoutError) {
    // A step blew past its deadline and was killed.
    return {
      status: "needs-human",
      exitCode: 1,
      message:
        `\n⚠️  ${noun} ${target} halted: a step exceeded its deadline and was aborted — status: needs-human.\n` +
        `   ${err.message}\n`,
    };
  }

  if (err instanceof RunBudgetExceededError) {
    // The run hit its wall-clock or step-count ceiling.
    return {
      status: "needs-human",
      exitCode: 1,
      message:
        `\n⚠️  ${noun} ${target} halted: run budget exceeded — status: needs-human.\n` +
        `   ${err.message}\n`,
    };
  }

  return { rethrow: true };
}
