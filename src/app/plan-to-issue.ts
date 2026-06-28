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

/**
 * A stage whose purpose is verification (the master-plan skill titles its final
 * gate "Verification") produces no new artifacts — the tests it checks were
 * already written in earlier TDD worker stages. Such a stage must NOT get a
 * committing worker, or the worker finds nothing to commit and the pipeline
 * crashes. The stage title is the declarative signal from the plan author.
 */
const VERIFICATION_TITLE_RE = /verif/i;

function isVerificationStage(stage: PlanStage): boolean {
  return VERIFICATION_TITLE_RE.test(stage.title);
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

  const verifier: Step = {
    ...base,
    tier: "verifier",
    skills: config.skills.verifier,
    instruction:
      `Verify stage ${stage.number} ("${stage.title}"): check the committed work against the ` +
      `acceptance criteria of tasks ${taskIds} in the plan. ` +
      `You MUST actually run the project's gates, not just read the diff: run the typecheck ` +
      `(e.g. the "typecheck" script, or tsc --noEmit) AND the full test suite, and report what ` +
      `they output. A type error or a failing test — anywhere, including in test files — is a ` +
      `FAIL. Do not modify code. ` +
      `End your reply with a single line, exactly "VERDICT: PASS" if the typecheck is clean, the ` +
      `full test suite passes, and the acceptance criteria are met, or "VERDICT: FAIL" otherwise ` +
      `followed by a short list of what must change.`,
    // No commitMessage: a verifier only reads and returns a verdict.
  };

  // A verification stage is verifier-only: there is nothing new to implement or
  // commit, just a verdict on already-committed work.
  if (isVerificationStage(stage)) {
    return { issue: config.issue, stage: stageId, steps: [verifier] };
  }

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

  return { issue: config.issue, stage: stageId, steps: [worker, verifier] };
}
