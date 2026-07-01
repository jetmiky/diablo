/**
 * loadIssue turns a ticket into an executable Issue. It is resume-aware:
 *
 *  - If the frozen plan already exists, it is reused (honoring the master-plan
 *    skill's "frozen, never edited" rule) — no planner run.
 *  - Otherwise a architect step runs with the master-plan skill and the
 *    ticket(s) injected, which writes the frozen plan file; that file is then
 *    parsed and mapped into the issue pipeline.
 *
 * The pure parts (parse, map) are tested directly; this use-case sequences the
 * I/O around them and is tested against in-memory fakes.
 */
import type { AgentPort } from "../ports/agent.ts";
import type { GitPort } from "../ports/git.ts";
import type { FsPort } from "../ports/fs.ts";
import type { RunSpec } from "../domain/run-spec.ts";
import type { GateMode } from "../ports/gate.ts";
import { parsePlan, PlanParseError, type Plan } from "../domain/plan.ts";
import { planToIssue } from "./plan-to-issue.ts";
import { PLANNER_GUIDANCE } from "./planner-guidance.ts";
import type { Issue } from "./run-issue.ts";

export interface LoadIssueConfig {
  issue: string;
  worktree: string;
  /** Ticket file(s) under .scratch, injected as inputs to the planner. */
  ticketPaths: string[];
  /** Absolute path where the frozen plan lives / will be written. */
  planPath: string;
  skills: {
    planner: string[];
    designer: string[];
    worker: string[];
    verifier: string[];
  };
  /**
   * The instruction handed to the architect step. Defaults to the master-plan
   * flow; `diablo refactor` swaps it for an improve-codebase-architecture flow.
   * The planner SKILL itself is set via skills.planner — this is the prose that
   * tells the planner what to produce and where to write it.
   */
  plannerInstruction?: string;
  /**
   * The human-checkpoint mode, passed through to the mapped pipeline steps.
   * "approval" gates each verifying step; "none"/omitted runs AFK.
   */
  gate?: GateMode;
}

export interface LoadIssueDeps {
  agent: AgentPort;
  git: GitPort;
  fs: FsPort;
}

export async function loadIssue(deps: LoadIssueDeps, config: LoadIssueConfig): Promise<Issue> {
  if (!(await deps.fs.exists(config.planPath))) {
    await generatePlan(deps, config);
    if (!(await deps.fs.exists(config.planPath))) {
      throw new Error(
        `Planner ran but the plan file was not written at ${config.planPath}. ` +
          `Expected the master-plan step to create it.`,
      );
    }
  }

  const plan = await parseWithBoundedReask(deps, config);

  return planToIssue(plan, {
    issue: config.issue,
    worktree: config.worktree,
    planPath: config.planPath,
    ticketPaths: config.ticketPaths,
    skills: {
      designer: config.skills.designer,
      worker: config.skills.worker,
      verifier: config.skills.verifier,
    },
    gate: config.gate,
  });
}

/**
 * Parses the frozen plan, with ONE bounded recovery attempt on a malformed plan.
 * The planner is an LLM; an occasional format drift should not waste the
 * priciest step in the run and then crash. On a PlanParseError we re-run the
 * planner ONCE with the parser's specific diagnostic injected as feedback, then
 * re-parse. A second consecutive failure propagates the PlanParseError so the
 * caller halts cleanly to a human — never an unbounded re-ask loop, which would
 * keep burning planner calls. Mirrors run-stage's bounded FAIL retry pattern.
 */
async function parseWithBoundedReask(deps: LoadIssueDeps, config: LoadIssueConfig): Promise<Plan> {
  try {
    return parsePlan(await deps.fs.read(config.planPath));
  } catch (err) {
    if (!(err instanceof PlanParseError)) throw err;

    // One re-ask: re-run the planner with the exact complaint, then re-parse.
    await generatePlan(deps, config, err.diagnostic);
    return parsePlan(await deps.fs.read(config.planPath));
  }
}

async function generatePlan(
  deps: LoadIssueDeps,
  config: LoadIssueConfig,
  reaskDiagnostic?: string,
): Promise<void> {
  const baseInstruction =
    config.plannerInstruction ??
    `Create the frozen master plan for this issue following the master-plan skill. ` +
      `Break the ticket(s) into sequenced stages and T-00X tasks, and write the plan to ` +
      `${config.planPath}.`;

  // On a re-ask, lead with the parser's complaint so the planner fixes the
  // specific format defect rather than blindly regenerating.
  const withReask = reaskDiagnostic
    ? `Your previous plan could not be parsed: ${reaskDiagnostic}\n\n` +
      `Rewrite the plan to ${config.planPath} so it parses, following the format above. ` +
      baseInstruction
    : baseInstruction;

  // Append engine-owned plan-shape guidance (no zero-source stage; acceptance
  // criteria must trace to the ticket) regardless of which flow built the base.
  const instruction = `${withReask}\n\n${PLANNER_GUIDANCE}`;

  const spec: RunSpec = {
    tier: "architect",
    issue: config.issue,
    stage: "plan",
    skills: config.skills.planner,
    inputs: config.ticketPaths,
    instruction,
    worktree: config.worktree,
  };
  await deps.agent.run(spec);
}
