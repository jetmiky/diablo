/**
 * Maps a parsed Plan into an executable Issue: each plan stage becomes a Stage
 * whose steps run the implement-then-verify sequence. This is where diablo's
 * step topology for the implementation phase is defined — a worker step that
 * implements the stage and commits, followed by a verifier step that checks the
 * committed work against the stage's acceptance criteria without committing.
 *
 * Pure (Plan -> Issue) so it is unit-tested directly. The frozen plan file is
 * injected as an @input to every step so each fresh agent reads the same spec.
 */
import type { Plan, PlanStage } from "../domain/plan.ts";
import type { Issue } from "./run-issue.ts";
import type { Stage } from "./run-stage.ts";
import type { Step } from "./run-step.ts";

export interface PlanToIssueConfig {
  issue: string;
  worktree: string;
  /** Absolute path to the frozen plan file, injected as an input to every step. */
  planPath: string;
  skills: {
    worker: string[];
    verifier: string[];
  };
}

export function planToIssue(plan: Plan, config: PlanToIssueConfig): Issue {
  return {
    issue: config.issue,
    stages: plan.stages.map((stage) => mapStage(stage, config)),
  };
}

function mapStage(stage: PlanStage, config: PlanToIssueConfig): Stage {
  const stageId = `stage-${stage.number}`;
  const taskIds = stage.tasks.map((t) => t.id).join(", ");
  const base = {
    issue: config.issue,
    stage: stageId,
    worktree: config.worktree,
    inputs: [config.planPath],
  };

  const worker: Step = {
    ...base,
    tier: "worker",
    skills: config.skills.worker,
    instruction:
      `Implement stage ${stage.number} ("${stage.title}") from the plan: tasks ${taskIds}. ` +
      `Follow the plan's tasks and acceptance criteria, and the TDD skill's red-green-refactor discipline. ` +
      `Work autonomously: do NOT ask for approval or confirmation — there is no human to answer. ` +
      `Implement the code and tests directly, and run the tests yourself before finishing.`,
    commitMessage: `feat(${config.issue}): stage ${stage.number} - ${stage.title}`,
  };

  const verifier: Step = {
    ...base,
    tier: "verifier",
    skills: config.skills.verifier,
    instruction:
      `Verify stage ${stage.number} ("${stage.title}"): check the committed work against the ` +
      `acceptance criteria of tasks ${taskIds} in the plan. Report a verdict of ` +
      `acceptable, or list what must change. Do not modify code.`,
    // No commitMessage: a verifier only reads and returns a verdict.
  };

  return { issue: config.issue, stage: stageId, steps: [worker, verifier] };
}
