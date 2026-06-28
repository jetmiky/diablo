/**
 * run-issue runs all stages of an issue in declared order — the top of the
 * pure orchestration backbone. Each stage commits its work in the shared
 * worktree; run-issue records each stage's handoff commit and surfaces the
 * LAST one as the issue's final handoff token (the SHA an approval/PR gate
 * would act on).
 *
 * Sequential and fail-fast: if a stage throws (an errored step), the issue
 * stops and later stages do not run. Pure orchestration over run-stage, so it
 * is unit-tested against fakes. Progress events (stage lifecycle, done, halted)
 * are emitted through the optional ProgressPort in deps.
 */
import { runStage, type Stage, type StageResult, type RetryPolicy } from "./run-stage.ts";
import type { RunStepDeps } from "./run-step.ts";
import type { ProgressEvent } from "../ports/progress.ts";

export interface Issue {
  issue: string;
  stages: Stage[];
}

export interface IssueResult {
  stages: StageResult[];
  /** The last stage's handoff commit — the issue's final handoff token, if any. */
  commit?: string;
}

export async function runIssue(
  deps: RunStepDeps,
  issue: Issue,
  retry: RetryPolicy = { limit: 0 },
): Promise<IssueResult> {
  const stages: StageResult[] = [];
  let commit: string | undefined;

  const emit = (event: ProgressEvent) => deps.progress?.emit(event) ?? Promise.resolve();

  for (let i = 0; i < issue.stages.length; i++) {
    const stage = issue.stages[i]!;
    const title = stageTitle(stage);
    await emit({
      kind: "stage-started",
      stage: stage.stage,
      title,
      index: i + 1,
      total: issue.stages.length,
    });

    let result: StageResult;
    try {
      result = await runStage(deps, stage, retry);
    } catch (err) {
      await emit({ kind: "halted", reason: haltReason(stage, err) });
      throw err;
    }

    stages.push(result);
    if (result.commit !== undefined) commit = result.commit;
    await emit({ kind: "stage-done", stage: stage.stage, title });
  }

  await emit({ kind: "done", commit });
  return { stages, commit };
}

/**
 * A stage's human-facing title. Stages carry an id (stage-N); the worker step's
 * commit message holds the readable title, so derive it when available, else
 * fall back to the id.
 */
function stageTitle(stage: Stage): string {
  const worker = stage.steps.find((s) => s.commitMessage);
  const match = worker?.commitMessage?.match(/stage \d+ - (.+)$/i);
  return match?.[1] ?? stage.stage;
}

function haltReason(stage: Stage, err: unknown): string {
  const base = err instanceof Error ? err.message.split("\n")[0] : String(err);
  return `${stage.stage}: ${base}`;
}
