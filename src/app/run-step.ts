/**
 * run-step is the core use-case: it runs ONE agent step in its worktree and,
 * if the step is meant to produce work, commits the result. The commit SHA is
 * the durable handoff token the next step receives.
 *
 * Whether a step commits is a declarative property (`commitMessage`), not
 * runtime guesswork: a worker/planner step that produces artifacts sets a
 * commit message; a verifier step that only reads and returns a verdict leaves
 * it undefined and never commits.
 *
 * Pure orchestration: depends only on the AgentPort and GitPort interfaces, so
 * it is unit-tested against fakes.
 */
import type { AgentPort } from "../ports/agent.ts";
import type { GitPort } from "../ports/git.ts";
import type { PiResult } from "../domain/pi-result.ts";
import type { RunSpec, Tier } from "../domain/run-spec.ts";

export interface Step {
  tier: Tier;
  issue: string;
  stage: string;
  skills: string[];
  inputs: string[];
  instruction: string;
  worktree: string;
  /**
   * When set, the step commits its worktree changes with this message after a
   * successful agent run, and the resulting SHA is returned. When undefined,
   * the step produces no commit (e.g. a verifier that only reads state).
   */
  commitMessage?: string;
}

export interface RunStepDeps {
  agent: AgentPort;
  git: GitPort;
}

export interface StepResult extends PiResult {
  /** The commit SHA produced by this step, if it committed. */
  commit?: string;
}

function specOf(step: Step): RunSpec {
  return {
    tier: step.tier,
    issue: step.issue,
    stage: step.stage,
    skills: step.skills,
    inputs: step.inputs,
    instruction: step.instruction,
    worktree: step.worktree,
  };
}

export async function runStep(deps: RunStepDeps, step: Step): Promise<StepResult> {
  const result = await deps.agent.run(specOf(step));

  // Never commit work from a run that ended in error.
  if (result.stopReason === "error") {
    throw new Error(
      `Agent step ${step.tier} (${step.issue}/${step.stage}) ended in error: ${result.text}`,
    );
  }

  if (step.commitMessage === undefined) {
    return result;
  }

  const commit = await deps.git.commit(step.worktree, step.commitMessage);
  return { ...result, commit };
}
