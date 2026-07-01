/**
 * run-stage runs the steps of one stage in declared order, threading them
 * through the shared worktree. Steps within a stage hand off through the
 * filesystem (designer writes a note, worker reads it and commits, verifier
 * reads the committed state) — so the stage does not pass commit SHAs between
 * its own steps; it records the LAST committing step's SHA as the stage's
 * handoff token for the NEXT stage.
 *
 * Sequential and fail-fast, with one recovery path: when a verifier returns
 * VERDICT: FAIL [implementation], the stage re-runs its worker with the
 * verifier's feedback injected and re-verifies, bounded by a retry limit. A
 * FAIL [plan] (or an exhausted limit) halts to a human — never auto-replan, as
 * that would break the frozen-plan guarantee. Pure orchestration over run-step,
 * unit-tested against fakes. Progress events are emitted through the optional
 * ProgressPort in deps.
 */
import {
  runStep,
  VerificationFailedError,
  type RunStepDeps,
  type Step,
  type StepResult,
} from "./run-step.ts";
import type { ProgressEvent } from "../ports/progress.ts";

export interface Stage {
  issue: string;
  stage: string;
  steps: Step[];
  /**
   * Recovery worker for a stage whose verifying step has NO worker in its own
   * step list — specifically the FINAL whole-feature verification (a planner-
   * tier step with verifies:true that commits nothing). When that holistic
   * verifier returns a code-fixable FAIL [implementation], run-stage re-runs
   * THIS worker with the verdict feedback, then re-verifies — bounded by the
   * retry limit — instead of halting unrecoverably after every stage passed.
   * Omitted for ordinary stages, which recover via their own inline worker.
   */
  recoveryWorker?: Step;
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

const ACTIVITY: Partial<Record<Step["tier"], ProgressEvent["kind"]>> = {
  "planner": "design-running",
  worker: "worker-running",
  verifier: "verifier-running",
};

export async function runStage(
  deps: RunStepDeps,
  stage: Stage,
  retry: RetryPolicy = { limit: 0 },
): Promise<StageResult> {
  const steps: StepResult[] = [];
  let commit: string | undefined;

  const emit = (event: ProgressEvent) => deps.progress?.emit(event) ?? Promise.resolve();

  // What an implementation FAIL re-runs to recover. An ordinary stage uses its
  // own inline worker; the FINAL verification stage has none in its step list,
  // so it falls back to the stage's recoveryWorker (when provided).
  const inlineWorker = stage.steps.find((s) => s.tier === "worker");
  const recoveryWorker = inlineWorker ?? stage.recoveryWorker;

  for (const step of stage.steps) {
    // A step "verifies" when it is on the verifier tier OR is explicitly marked
    // verifies:true (the planner-tier FINAL verification). Both enforce a
    // verdict in run-step and both must be recoverable here.
    const isVerifying = step.verifies ?? step.tier === "verifier";
    if (!isVerifying) {
      const activity = ACTIVITY[step.tier];
      if (activity) await emit({ kind: activity, stage: stage.stage } as ProgressEvent);
      const result = await runStep(deps, step);
      steps.push(result);
      if (result.commit !== undefined) {
        commit = result.commit;
        await emit({ kind: "committed", stage: stage.stage, sha: result.commit });
        // The committing step's summary is the stage's handoff note: the
        // narrative a git diff cannot show (decisions, deferrals, gotchas). It
        // is folded into the live tracker and feeds the next stage's design.
        const note = handoffFrom(result.text);
        if (note) await emit({ kind: "handoff", stage: stage.stage, note });
      }
      continue;
    }

    // Verifying step: run it, and on an implementation FAIL re-run the recovery
    // worker with feedback up to the limit before re-verifying.
    let attempt = 0;
    while (true) {
      try {
        await emit({ kind: "verifier-running", stage: stage.stage });
        const result = await runStep(deps, step);
        steps.push(result);
        await emit({ kind: "verdict", stage: stage.stage, verdict: "pass" });
        break;
      } catch (err) {
        if (!(err instanceof VerificationFailedError)) throw err;
        await emit({ kind: "verdict", stage: stage.stage, verdict: "fail" });

        const category = err.category;
        // A plan defect, an exhausted budget, or nothing to re-run → halt.
        if (category === "plan" || attempt >= retry.limit || !recoveryWorker) throw err;

        attempt += 1;
        await emit({ kind: "retry", stage: stage.stage, attempt });
        const retryWorker = withFeedback(recoveryWorker, err.verdictText, attempt);
        await emit({ kind: "worker-running", stage: stage.stage });
        const workerResult = await runStep(deps, retryWorker);
        steps.push(workerResult);
        if (workerResult.commit !== undefined) {
          commit = workerResult.commit;
          await emit({ kind: "committed", stage: stage.stage, sha: workerResult.commit });
        }
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

/**
 * Condenses a committing step's summary into a one-line handoff note for the
 * tracker. The agent's full reply can be long; the note is the carry-forward
 * narrative, so take the first non-empty, non-verdict line and bound its length.
 */
function handoffFrom(text: string): string | undefined {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^verdict\s*:/i.test(l));
  if (!line) return undefined;
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}
