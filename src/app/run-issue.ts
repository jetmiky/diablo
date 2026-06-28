/**
 * run-issue runs all stages of an issue in declared order — the top of the
 * pure orchestration backbone. Each stage commits its work in the shared
 * worktree; run-issue records each stage's handoff commit and surfaces the
 * LAST one as the issue's final handoff token (the SHA an approval/PR gate
 * would act on).
 *
 * Sequential and fail-fast: if a stage throws (an errored step), the issue
 * stops and later stages do not run. Pure orchestration over run-stage, so it
 * is unit-tested against fakes. Progress-tracker writing (progress.md) is I/O
 * and layers on later as an injected port, not baked into this loop.
 */
import { runStage, type Stage, type StageResult } from "./run-stage.ts";
import type { RunStepDeps } from "./run-step.ts";

export interface Issue {
  issue: string;
  stages: Stage[];
}

export interface IssueResult {
  stages: StageResult[];
  /** The last stage's handoff commit — the issue's final handoff token, if any. */
  commit?: string;
}

export async function runIssue(deps: RunStepDeps, issue: Issue): Promise<IssueResult> {
  const stages: StageResult[] = [];
  let commit: string | undefined;

  for (const stage of issue.stages) {
    const result = await runStage(deps, stage);
    stages.push(result);
    if (result.commit !== undefined) {
      commit = result.commit;
    }
  }

  return { stages, commit };
}
