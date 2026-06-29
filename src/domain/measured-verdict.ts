/**
 * combineVerdict fuses the verifier LLM's self-reported verdict with the
 * MEASURED exit codes of diablo's engine-owned gate commands (ADR 0001). The
 * measured exit code has teeth: a green LLM verdict over any non-zero gate is a
 * FAIL, full stop. The LLM verdict can only DOWNGRADE the result (a FAIL/none
 * verdict fails the stage even when the gates pass — the verifier judged the
 * acceptance criteria unmet), never upgrade past a measured failure.
 *
 * The effective rule: PASS iff `llmVerdict === "pass" AND every gate exited 0`.
 * A measured failure is always categorised "implementation" (a code fault the
 * worker can retry), never "plan" — a failing typecheck/test is fixable code,
 * not a broken plan. When no gates are configured, the result falls back to the
 * LLM verdict and `measured` is false, so the caller can warn that the run is
 * LLM-verdict-only rather than silently trusting it.
 *
 * Pure (verdict + outcomes in, decision out) so it is unit-tested directly.
 */
import type { Verdict, VerdictCategory } from "./verdict.ts";

/** The exit code of one gate command run in the worktree. */
export interface GateOutcome {
  command: string;
  exitCode: number;
}

export interface MeasuredVerdict {
  verdict: "pass" | "fail";
  /** True when at least one deterministic gate command actually ran. */
  measured: boolean;
  /** On a measured failure, the retryable category (always "implementation"). */
  category: VerdictCategory;
  /** Human-readable reason on a fail (names the failing command + exit code). */
  reason?: string;
}

export function combineVerdict(
  llmVerdict: Verdict,
  llmCategory: VerdictCategory,
  gates: readonly GateOutcome[],
): MeasuredVerdict {
  const measured = gates.length > 0;

  // A measured gate failure overrides everything — including a green LLM
  // verdict OR an LLM plan-fail. A failing typecheck/test is a concrete code
  // fault the worker can retry, never a plan defect.
  const failedGate = gates.find((g) => g.exitCode !== 0);
  if (failedGate) {
    return {
      verdict: "fail",
      measured,
      category: "implementation",
      reason: `gate command \`${failedGate.command}\` failed (exit ${failedGate.exitCode})`,
    };
  }

  // Gates passed (or none configured): the LLM verdict decides. It can only
  // downgrade — a non-pass verdict fails the stage even with green gates.
  if (llmVerdict !== "pass") {
    return {
      verdict: "fail",
      measured,
      // Preserve the LLM's category so a genuine FAIL [plan] still halts to a
      // human; a SILENT verifier (none) is not a plan defect, so it stays
      // implementation (retryable).
      category: llmVerdict === "fail" ? llmCategory : "implementation",
      reason:
        llmVerdict === "none"
          ? "the verifier returned no VERDICT line (silence is not success)"
          : "the verifier returned VERDICT: FAIL",
    };
  }

  return { verdict: "pass", measured, category: "implementation" };
}
