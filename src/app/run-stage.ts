/**
 * run-stage runs the steps of one stage in declared order, threading them
 * through the shared worktree. Steps within a stage hand off through the
 * filesystem (planner writes plan.md, worker reads it and commits, verifier
 * reads the committed state) — so the stage does not pass commit SHAs between
 * its own steps; it records the LAST committing step's SHA as the stage's
 * handoff token for the NEXT stage.
 *
 * Sequential and fail-fast: if a step throws (e.g. an errored agent run), the
 * stage stops and later steps do not run. Pure orchestration over run-step, so
 * it is unit-tested against fakes.
 */
import { runStep, type RunStepDeps, type Step, type StepResult } from "./run-step.ts";

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

export async function runStage(deps: RunStepDeps, stage: Stage): Promise<StageResult> {
  const steps: StepResult[] = [];
  let commit: string | undefined;

  for (const step of stage.steps) {
    const result = await runStep(deps, step);
    steps.push(result);
    if (result.commit !== undefined) {
      commit = result.commit;
    }
  }

  return { steps, commit };
}
