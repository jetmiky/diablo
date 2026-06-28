/**
 * run-stage runs the steps of one stage in declared order, threading them
 * through the shared worktree. Steps within a stage hand off through the
 * filesystem (planner writes plan.md, worker reads it and commits, verifier
 * reads the committed state) — so the stage does not pass commit SHAs between
 * its own steps; it records the LAST committing step's SHA as the stage's
 * handoff token for the NEXT stage.
 *
 * Sequential and fail-fast, with one recovery path: when a verifier returns
 * VERDICT: FAIL [implementation], the stage re-runs its worker with the
 * verifier's feedback injected and re-verifies, bounded by a retry limit. A
 * FAIL [plan] (or an exhausted limit) halts to a human — never auto-replan, as
 * that would break the frozen-plan guarantee. Pure orchestration over run-step,
 * unit-tested against fakes.
 */
import {
  runStep,
  VerificationFailedError,
  type RunStepDeps,
  type Step,
  type StepResult,
} from "./run-step.ts";
import { parseVerdictCategory } from "../domain/verdict.ts";

export interface Stage {
  issue: string;
  stage: string;
  steps: Step[];
}

export interface StageResult {
  steps: StepResult[];
  /** The last committing step's SHA — the stage's handoff token, if any. */
  commit?: string;
}

/**
 * Bounds the worker re-attempts on an implementation FAIL. `limit` is the
 * number of EXTRA worker runs allowed after the first; 0 (the default) means no
 * retry, preserving the original fail-fast behaviour exactly.
 */
export interface RetryPolicy {
  limit: number;
}

export async function runStage(
  deps: RunStepDeps,
  stage: Stage,
  retry: RetryPolicy = { limit: 0 },
): Promise<StageResult> {
  const steps: StepResult[] = [];
  let commit: string | undefined;

  // The worker is what an implementation FAIL re-runs; a verification-only
  // stage has none, so its FAIL can only halt.
  const workerStep = stage.steps.find((s) => s.tier === "worker");

  for (const step of stage.steps) {
    if (step.tier !== "verifier") {
      const result = await runStep(deps, step);
      steps.push(result);
      if (result.commit !== undefined) commit = result.commit;
      continue;
    }

    // Verifier step: run it, and on an implementation FAIL re-run the worker
    // with feedback up to the limit before re-verifying.
    let attempt = 0;
    while (true) {
      try {
        const result = await runStep(deps, step);
        steps.push(result);
        break;
      } catch (err) {
        if (!(err instanceof VerificationFailedError)) throw err;

        const category = parseVerdictCategory(err.verdictText);
        // A plan defect, an exhausted budget, or nothing to re-run → halt.
        if (category === "plan" || attempt >= retry.limit || !workerStep) throw err;

        attempt += 1;
        const retryWorker = withFeedback(workerStep, err.verdictText, attempt);
        const workerResult = await runStep(deps, retryWorker);
        steps.push(workerResult);
        if (workerResult.commit !== undefined) commit = workerResult.commit;
        // loop: re-verify the freshly-committed fix
      }
    }
  }

  return { steps, commit };
}

/**
 * Builds a retry of the worker step with the verifier's feedback appended to
 * its instruction, so the re-run fixes the specific defect rather than blindly
 * redoing the stage. The attempt number is included for traceability.
 */
function withFeedback(worker: Step, feedback: string, attempt: number): Step {
  return {
    ...worker,
    instruction:
      `${worker.instruction}\n\n` +
      `RETRY ${attempt}: a previous attempt failed verification. Address this verifier ` +
      `feedback precisely, then ensure the typecheck and full test suite pass:\n${feedback.trim()}`,
  };
}
