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
import { NoChangesToCommitError, type GitPort } from "../ports/git.ts";
import type { GateMode, GatePort } from "../ports/gate.ts";
import { GateDeclinedError } from "../ports/gate.ts";
import type { PiResult } from "../domain/pi-result.ts";
import type { RunSpec, Tier } from "../domain/run-spec.ts";
import { parseVerdict } from "../domain/verdict.ts";
import type { ProgressPort } from "../ports/progress.ts";

/**
 * Thrown when a verifier step does not return a passing verdict — either it
 * reported VERDICT: FAIL, or it returned no verdict line at all (silence is
 * treated as failure, never as success). Halts the pipeline fail-fast so a
 * stage with a type error or failing test cannot be claimed as complete.
 */
export class VerificationFailedError extends Error {
  constructor(
    readonly issue: string,
    readonly stage: string,
    readonly verdictText: string,
  ) {
    super(
      `Verification failed for ${issue}/${stage}: the verifier did not return ` +
        `VERDICT: PASS.\n${verdictText}`,
    );
    this.name = "VerificationFailedError";
  }
}

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
  /**
   * The human checkpoint for this step, consulted AFTER the agent runs and
   * commits. "approval" asks the GatePort to confirm; "none" (or omitted) runs
   * fully AFK. Declining halts the pipeline with GateDeclinedError.
   */
  gate?: GateMode;
  /**
   * When true, the step's output MUST end with a passing VERDICT line or the
   * pipeline halts (silence = failure). Defaults to true for verifier-tier
   * steps; set explicitly so a non-verifier step (e.g. a planner-tier FINAL
   * verification) can also enforce a verdict without being on the verifier tier.
   */
  verifies?: boolean;
}

export interface RunStepDeps {
  agent: AgentPort;
  git: GitPort;
  /** Required only when a step requests an "approval" gate. */
  gate?: GatePort;
  /** Optional progress sink; when present, the run loop emits structured events to it. */
  progress?: ProgressPort;
  /**
   * Optional liveness-ticker factory. When present, runStep builds a heartbeat
   * around the (long, otherwise-silent) agent call: it is started before the
   * run and stopped after — even on failure. Each tick forwards the elapsed
   * time as a `heartbeat` progress event for this step's stage, so a surface
   * can show the run is alive without the agent emitting anything itself. The
   * factory receives the per-tick callback and returns a start/stop handle, so
   * the timer is injected and the wiring is unit-tested without a real clock.
   */
  heartbeat?: (onTick: (elapsedMs: number) => void) => HeartbeatHandle;
}

/** A started/stoppable liveness ticker handle (see RunStepDeps.heartbeat). */
export interface HeartbeatHandle {
  start(): void;
  stop(): void;
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

/**
 * Runs the agent for a step, bracketing it with the optional liveness heartbeat.
 * The ticker is started before the (long, silent) agent call and stopped in a
 * finally so it never outlives the call — even when the run throws. Each tick
 * is forwarded as a `heartbeat` progress event for the step's stage; emit
 * failures are swallowed so liveness never breaks the run. With no heartbeat
 * factory (the default), this is just `agent.run`.
 */
async function runAgentWithHeartbeat(deps: RunStepDeps, step: Step): Promise<PiResult> {
  if (!deps.heartbeat) return deps.agent.run(specOf(step));

  const beat = deps.heartbeat((elapsedMs) => {
    void deps.progress
      ?.emit({ kind: "heartbeat", stage: step.stage, elapsedMs })
      .catch(() => {
        // Liveness is best-effort; a failed tick must never break the step.
      });
  });

  beat.start();
  try {
    return await deps.agent.run(specOf(step));
  } finally {
    beat.stop();
  }
}

export async function runStep(deps: RunStepDeps, step: Step): Promise<StepResult> {
  const result = await runAgentWithHeartbeat(deps, step);

  // Never commit work from a run that ended in error.
  if (result.stopReason === "error") {
    throw new Error(
      `Agent step ${step.tier} (${step.issue}/${step.stage}) ended in error: ${result.text}`,
    );
  }

  // A step that verifies (any verifier-tier step, or one explicitly marked
  // verifies:true such as a planner-tier final verification) must end with a
  // passing VERDICT line. A FAIL — or no verdict line at all (silence is not
  // success) — halts the pipeline fail-fast.
  const enforcesVerdict = step.verifies ?? step.tier === "verifier";
  if (enforcesVerdict && parseVerdict(result.text) !== "pass") {
    throw new VerificationFailedError(step.issue, step.stage, result.text);
  }

  if (step.commitMessage === undefined) {
    await maybeGate(deps, step, result, undefined);
    return result;
  }

  // Commit the step's work. A worker that produced NO new changes is not a
  // failure: a stage whose scope an earlier stage already satisfied has nothing
  // to commit, and the verifier — not the commit step — is the source of truth
  // for whether the stage is satisfied. So a NoChangesToCommitError is swallowed
  // (no commit SHA, the verifier judges next); any other git error propagates.
  let commit: string | undefined;
  try {
    commit = await deps.git.commit(step.worktree, step.commitMessage);
  } catch (err) {
    if (!(err instanceof NoChangesToCommitError)) throw err;
  }
  await maybeGate(deps, step, result, commit);
  return commit === undefined ? result : { ...result, commit };
}

/**
 * Consults the human gate after the step's work is committed. A "none" or
 * omitted gate runs fully AFK. An "approval" gate requires a GatePort; a
 * decline halts the pipeline with GateDeclinedError.
 */
async function maybeGate(
  deps: RunStepDeps,
  step: Step,
  result: PiResult,
  commit: string | undefined,
): Promise<void> {
  if (step.gate !== "approval") return;

  if (!deps.gate) {
    throw new Error(
      `Step ${step.tier} (${step.issue}/${step.stage}) requests an approval gate ` +
        `but no GatePort was provided.`,
    );
  }

  const proceed = await deps.gate.confirm({
    tier: step.tier,
    issue: step.issue,
    stage: step.stage,
    summary: result.text,
    commit,
  });

  if (!proceed) {
    throw new GateDeclinedError(step.issue, step.stage, step.tier);
  }
}
