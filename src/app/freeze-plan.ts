/**
 * Freeze-plan use-case: on explicit approval, dispatches a final planner-high
 * step to rewrite the plan as clean/frozen with a "Decisions & rationale"
 * section distilling the negotiation, then persists issue status as "planned".
 */
import type { AgentPort } from "../ports/agent.ts";
import type { FsPort } from "../ports/fs.ts";
import type { RunSpec } from "../domain/run-spec.ts";
import { writeStatus } from "./issue-status-store.ts";

export interface FreezePlanDeps {
  agent: AgentPort;
  fs: FsPort;
}

export interface FreezePlanConfig {
  issue: string;
  worktree: string;
  planPath: string;
  diabloDir: string;
  plannerSkills: string[];
  /**
   * The stable per-negotiation identifier. Passing the SAME runId used in
   * proposePlan/negotiateTurn resumes the same session, so the planner has
   * the full negotiation transcript to distill into the rationale section.
   */
  runId: string;
}

/**
 * Freezes the plan after explicit approval. Dispatches a final planner-high
 * step (SAME stable session as the proposal/negotiation) instructing the
 * planner to REWRITE the plan at planPath as a clean, frozen plan PLUS a
 * "Decisions & rationale" section distilling the *why* from the negotiation.
 * Then persists issue status as "planned".
 */
export async function freezePlan(
  deps: FreezePlanDeps,
  config: FreezePlanConfig,
): Promise<void> {
  const instruction =
    `REWRITE the plan at ${config.planPath} as a clean, frozen plan. Add a ` +
    `## Decisions & rationale section distilling the key decisions and the ` +
    `reasoning from our negotiation. This is the final, approved plan.`;

  const spec: RunSpec = {
    tier: "planner-high",
    issue: config.issue,
    stage: "plan",
    skills: config.plannerSkills,
    inputs: [],
    instruction,
    worktree: config.worktree,
    runId: config.runId,
  };

  await deps.agent.run(spec);

  await writeStatus(deps, {
    diabloDir: config.diabloDir,
    issue: config.issue,
    status: "planned",
  });
}
