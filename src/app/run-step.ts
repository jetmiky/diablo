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
import { outOfScopeFiles } from "../domain/commit-scope.ts";
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

/**
 * Thrown when an agent step exceeds its per-step deadline. run-step aborts the
 * agent (killing the underlying process via the abort signal) and throws this,
 * so an unattended step cannot hang forever. The caller halts the run cleanly
 * to a human rather than waiting indefinitely.
 */
export class StepTimeoutError extends Error {
  constructor(
    readonly issue: string,
    readonly stage: string,
  ) {
    super(`Step ${issue}/${stage} exceeded its deadline and was aborted.`);
    this.name = "StepTimeoutError";
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
   * The task's declared Target Files for this step (worker steps only). After a
   * commit, run-step compares the actually-committed files against these and
   * emits a `scope-warning` for any stray (non-target, non-test) file. Warn,
   * never block. Empty/omitted disables the check (nothing to scope against).
   */
  targetFiles?: string[];
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
  /**
   * Optional per-step deadline factory. When present, runStep arms a deadline
   * around the agent call: the factory receives an `onExpire` callback and
   * returns a start/stop handle. On expiry, runStep aborts the agent (killing
   * the underlying process via an AbortSignal) and throws StepTimeoutError, so
   * an unattended step cannot hang forever. Injected so the timeout is
   * unit-tested by firing expiry by hand, with no real timer.
   */
  deadline?: (onExpire: () => void) => DeadlineHandle;
  /**
   * Optional global run-budget gate. When present, runStep calls `check()`
   * BEFORE running the agent; a breach throws (RunBudgetExceededError) and the
   * agent never runs, so a runaway run is stopped at the next step boundary.
   */
  budget?: BudgetGate;
}

/** A started/stoppable per-step deadline handle (see RunStepDeps.deadline). */
export interface DeadlineHandle {
  start(): void;
  stop(): void;
}

/** The run-budget seam: check() throws when a ceiling is breached. */
export interface BudgetGate {
  check(): void;
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
 * Runs the agent for a step, bracketing it with the optional liveness heartbeat
 * and forwarding the optional abort signal (used by the per-step deadline to
 * kill a hung run). The ticker is started before the (long, silent) agent call
 * and stopped in a finally so it never outlives the call — even when the run
 * throws. Each tick is forwarded as a `heartbeat` progress event; emit failures
 * are swallowed so liveness never breaks the run.
 */
async function runAgentWithHeartbeat(
  deps: RunStepDeps,
  step: Step,
  signal?: AbortSignal,
): Promise<PiResult> {
  if (!deps.heartbeat) return deps.agent.run(specOf(step), undefined, signal);

  // The most recent activity label the agent reported (e.g. "editing foo.ts"),
  // folded into each heartbeat tick so the liveness line reflects what the
  // agent is doing right now. Undefined until the first tool starts.
  let activity: string | undefined;

  const beat = deps.heartbeat((elapsedMs) => {
    void deps.progress
      ?.emit({ kind: "heartbeat", stage: step.stage, elapsedMs, ...(activity ? { activity } : {}) })
      .catch(() => {
        // Liveness is best-effort; a failed tick must never break the step.
      });
  });

  beat.start();
  try {
    return await deps.agent.run(
      specOf(step),
      (label) => {
        activity = label;
      },
      signal,
    );
  } finally {
    beat.stop();
  }
}

/**
 * Runs the agent for a step under an optional per-step deadline. When a deadline
 * factory is present, an AbortController is wired so the deadline's expiry
 * aborts the agent (killing the underlying process); the agent's rejection is
 * then surfaced as a StepTimeoutError. The deadline is always stopped in a
 * finally. With no deadline factory, this is just the heartbeat-bracketed run.
 */
async function runAgentWithDeadline(deps: RunStepDeps, step: Step): Promise<PiResult> {
  if (!deps.deadline) return runAgentWithHeartbeat(deps, step);

  const controller = new AbortController();
  let timedOut = false;
  const handle = deps.deadline(() => {
    timedOut = true;
    controller.abort();
  });

  handle.start();
  try {
    return await runAgentWithHeartbeat(deps, step, controller.signal);
  } catch (err) {
    // A rejection caused by our own deadline-driven abort becomes a typed
    // timeout; any other failure propagates unchanged.
    if (timedOut) throw new StepTimeoutError(step.issue, step.stage);
    throw err;
  } finally {
    handle.stop();
  }
}

export async function runStep(deps: RunStepDeps, step: Step): Promise<StepResult> {
  // Global circuit breaker: account for this step and assert the run is still
  // within its wall-clock + step-count budget BEFORE spending an agent call.
  deps.budget?.check();

  const result = await runAgentWithDeadline(deps, step);

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

  // Scope check (warn, never block): if the commit touched files outside the
  // task's declared Target Files (tests excepted), surface them so AFK scope
  // creep is visible. Best-effort — a failure here must never break the step.
  if (commit !== undefined && step.targetFiles && step.targetFiles.length > 0) {
    try {
      const committed = await deps.git.committedFiles(step.worktree, commit);
      const strays = outOfScopeFiles(step.targetFiles, committed);
      if (strays.length > 0) {
        await deps.progress?.emit({ kind: "scope-warning", stage: step.stage, files: strays });
      }
    } catch {
      // Scope reporting is advisory; never let it fail the step.
    }
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
