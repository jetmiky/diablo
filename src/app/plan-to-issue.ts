/**
 * Maps a parsed Plan into an executable Issue. This is where diablo's step
 * topology is defined.
 *
 * An implementation stage runs three steps, handing off through the worktree:
 *   1. design   (planner-med) — reads the ACTUAL code committed by prior stages
 *                plus this stage's tasks, and writes a short design note naming
 *                the functions/types/files (with signatures) this stage will
 *                create or touch. Advisory: it does not commit.
 *   2. worker   (worker tier) — implements the stage against the plan AND the
 *                design note (injected as an input), committing the result.
 *   3. verifier (verifier tier) — checks the committed work and returns a verdict.
 *
 * A final "Verification" stage (the master-plan skill's declarative last gate)
 * produces no new artifacts; it maps to a SINGLE verification step on the
 * PLANNER tier (a holistic, whole-feature judgment), not the cheap per-stage
 * verifier tier — and it commits nothing.
 *
 * Pure (Plan -> Issue) so it is unit-tested directly. The frozen plan file is
 * injected as an @input to every step so each fresh agent reads the same spec.
 */
import type { Plan, PlanStage } from "../domain/plan.ts";
import type { Issue } from "./run-issue.ts";
import type { Stage } from "./run-stage.ts";
import type { Step } from "./run-step.ts";
import type { GateMode } from "../ports/gate.ts";

export interface PlanToIssueConfig {
  issue: string;
  worktree: string;
  /** Absolute path to the frozen plan file, injected as an input to every step. */
  planPath: string;
  skills: {
    /** Skills for the per-stage design step (planner-med). */
    designer: string[];
    worker: string[];
    verifier: string[];
  };
  /**
   * The human-checkpoint mode for the run. "approval" attaches a gate to every
   * VERIFYING step (each per-stage verifier and the final whole-feature
   * verification) — run-step consults it AFTER the verdict is enforced, so the
   * human approves work that has already passed verification. "none" (the
   * default) leaves every step AFK. The design and worker steps are never
   * gated: the worker runs unattended, and approving a stage means approving its
   * VERIFIED result, not its raw mid-flight diff.
   */
  gate?: GateMode;
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
 * already written in earlier TDD worker stages. The stage title is the
 * declarative signal from the plan author.
 */
const VERIFICATION_TITLE_RE = /verif/i;

function isVerificationStage(stage: PlanStage): boolean {
  return VERIFICATION_TITLE_RE.test(stage.title);
}

/** The per-stage design note the design step writes and the worker reads. */
function designNotePath(config: PlanToIssueConfig, stageId: string): string {
  return `${config.worktree}/.plans/${config.issue}-${stageId}-design.md`;
}

const EMPTY_SUITE_NOTE =
  `Treat an EMPTY test suite as success, not failure: if the test runner reports "no tests ` +
  `found" (or exits non-zero ONLY because zero tests exist), that is NOT a FAIL — early stages ` +
  `in a TDD-staged plan legitimately precede their tests. Only an actually failing or erroring ` +
  `test counts as a FAIL. `;

const VERDICT_INSTRUCTION =
  EMPTY_SUITE_NOTE +
  `End your reply with a single line: exactly "VERDICT: PASS" if the typecheck is clean, the ` +
  `test suite passes (or is empty/not-yet-present), and the acceptance criteria are met. ` +
  `Otherwise end with "VERDICT: FAIL [implementation]" if the code is at fault (a fix to the ` +
  `code can satisfy the plan), or "VERDICT: FAIL [plan]" if the plan itself is wrong (it cannot ` +
  `be satisfied as specified) — followed by a short list of what must change.`;

function mapStage(stage: PlanStage, config: PlanToIssueConfig): Stage {
  const stageId = `stage-${stage.number}`;
  const taskIds = stage.tasks.map((t) => t.id).join(", ");
  // "approval" attaches the human gate to verifying steps only; run-step
  // consults it after the verdict passes. Anything else (incl. omitted) is AFK.
  const verifyGate: GateMode = config.gate === "approval" ? "approval" : "none";
  const base = {
    issue: config.issue,
    stage: stageId,
    worktree: config.worktree,
    inputs: [config.planPath],
  };

  // The FINAL verification stage: a single holistic verification on the PLANNER
  // tier (tier-mismatch fix), enforcing a verdict but committing nothing.
  if (isVerificationStage(stage)) {
    const finalVerify: Step = {
      ...base,
      tier: "planner-med",
      skills: config.skills.verifier,
      verifies: true,
      gate: verifyGate,
      instruction:
        `Perform the FINAL verification for stage ${stage.number} ("${stage.title}"): a holistic ` +
        `judgment over the WHOLE feature, not a single stage's diff. Check the committed work ` +
        `against the acceptance criteria of tasks ${taskIds} in the plan. ` +
        `You MUST actually run the project's gates, not just read the diff: run the typecheck ` +
        `(e.g. the "typecheck" script, or tsc --noEmit) AND the full test suite, and report what ` +
        `they output. A type error or a failing test — anywhere — is a FAIL. Do not modify code. ` +
        `Before the VERDICT line, emit a CRITERIA: checklist with one checkbox line per acceptance ` +
        `criterion from the relevant tasks, marking each [x] (checked) when you can cite concrete ` +
        `evidence (a test name, code path, or command output) that proves it, or [ ] (unchecked) ` +
        `if you cannot point to evidence. ` +
        VERDICT_INSTRUCTION,
    };
    return { issue: config.issue, stage: stageId, steps: [finalVerify] };
  }

  const notePath = designNotePath(config, stageId);

  const design: Step = {
    ...base,
    tier: "planner-med",
    skills: config.skills.designer,
    instruction:
      `Design stage ${stage.number} ("${stage.title}") of the plan (tasks ${taskIds}) BEFORE it ` +
      `is implemented. First read the ACTUAL code committed by prior stages (use git and read ` +
      `the relevant files in this worktree) so your design is grounded in real code, not guesses. ` +
      `Then write a SHORT design note to ${notePath} naming, for THIS stage only: the functions ` +
      `and types it will create or touch WITH their signatures, and the files it will add or ` +
      `change. Keep it consistent with the TDD skill (the worker will write tests first against ` +
      `these signatures). Do NOT implement the stage and do NOT modify source code — only write ` +
      `the design note.`,
    // No commitMessage: the design note is advisory; the worker commits the code.
  };

  const worker: Step = {
    ...base,
    tier: "worker",
    skills: config.skills.worker,
    inputs: [config.planPath, notePath],
    instruction:
      `Implement stage ${stage.number} ("${stage.title}") from the plan: tasks ${taskIds}. ` +
      `Follow the plan's tasks and acceptance criteria, the design note for this stage (the ` +
      `functions/types/files and signatures to use), and the TDD skill's red-green-refactor ` +
      `discipline. Work autonomously: do NOT ask for approval or confirmation — there is no human ` +
      `to answer. Implement the code and tests directly, and run the tests yourself before finishing.`,
    commitMessage: `feat(${config.issue}): stage ${stage.number} - ${stage.title}`,
  };

  const verifier: Step = {
    ...base,
    tier: "verifier",
    skills: config.skills.verifier,
    gate: verifyGate,
    instruction:
      `Verify stage ${stage.number} ("${stage.title}"): check the committed work against the ` +
      `acceptance criteria of tasks ${taskIds} in the plan. ` +
      `You MUST actually run the project's gates, not just read the diff: run the typecheck ` +
      `(e.g. the "typecheck" script, or tsc --noEmit) AND the full test suite, and report what ` +
      `they output. A type error or a failing test — anywhere, including in test files — is a ` +
      `FAIL. Do not modify code. ` +
      VERDICT_INSTRUCTION,
    // No commitMessage: a verifier only reads and returns a verdict.
  };

  return { issue: config.issue, stage: stageId, steps: [design, worker, verifier] };
}
