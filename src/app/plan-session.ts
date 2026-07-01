/**
 * Plan-session use-case: dispatches planner-tier Pi steps for plan proposal and
 * negotiation turns. Uses a STABLE session id (via stable runId + stage:"plan")
 * so Pi RESUMES the same conversation across turns — the opposite of a run's
 * per-step isolation. This lets the planner accumulate context from the human's
 * challenges and its own evolving reasoning.
 */
import type { AgentPort } from "../ports/agent.ts";
import type { FsPort } from "../ports/fs.ts";
import type { RunSpec } from "../domain/run-spec.ts";
import { PLANNER_GUIDANCE } from "./planner-guidance.ts";

export interface PlanSessionDeps {
  agent: AgentPort;
  fs: FsPort;
}

export interface PlanSessionConfig {
  issue: string;
  worktree: string;
  planPath: string;
  ticketPaths: string[];
  plannerSkills: string[];
  /**
   * A stable per-negotiation identifier. Passing the SAME runId across all
   * turns yields the same session id, so Pi resumes the conversation.
   */
  runId: string;
}

/**
 * Proposes the initial plan. Dispatches a architect step instructing the
 * planner to (a) read the ticket(s), (b) write a PROPOSED staged plan to
 * planPath following the master-plan skill, and (c) in its REPLY summarize
 * the approach, what it deliberately is NOT doing, and self-surfaced risks,
 * assumptions, or open questions.
 *
 * Returns the agent's reply text (the summary the human reacts to).
 */
export async function proposePlan(
  deps: PlanSessionDeps,
  config: PlanSessionConfig,
): Promise<string> {
  const instruction =
    `Propose a staged plan for this issue following the master-plan skill. ` +
    `Write the PROPOSED plan to ${config.planPath}. In your reply, summarize: ` +
    `(a) the approach, (b) what you are deliberately NOT doing, and ` +
    `(c) self-surfaced risks, assumptions, or open questions.\n\n${PLANNER_GUIDANCE}`;

  const spec: RunSpec = {
    tier: "architect",
    issue: config.issue,
    stage: "plan",
    skills: config.plannerSkills,
    inputs: config.ticketPaths,
    instruction,
    worktree: config.worktree,
    runId: config.runId,
  };

  const result = await deps.agent.run(spec);
  return result.text;
}

/**
 * Negotiates a turn in response to a human's challenge. Dispatches a planner-
 * high step (SAME stable session, so Pi has the full transcript) embedding the
 * user's message and anti-sycophancy guidance: challenges are hypotheses to
 * evaluate, not orders. The planner should defend or revise based on technical
 * merit, never agree reflexively.
 *
 * Returns the planner's reply text.
 */
export async function negotiateTurn(
  deps: PlanSessionDeps,
  config: PlanSessionConfig,
  userMessage: string,
): Promise<string> {
  const instruction =
    `The user has challenged the plan with:\n\n"${userMessage}"\n\n` +
    `A user challenge is a HYPOTHESIS to evaluate, not an order. If it is ` +
    `technically wrong or would damage the design, say so and explain why, ` +
    `citing the issue spec or the code. Revise the plan at ${config.planPath} ` +
    `ONLY if the challenge exposes a real gap or a better approach. Do not ` +
    `agree reflexively.`;

  const spec: RunSpec = {
    tier: "architect",
    issue: config.issue,
    stage: "plan",
    skills: config.plannerSkills,
    inputs: config.ticketPaths,
    instruction,
    worktree: config.worktree,
    runId: config.runId,
  };

  const result = await deps.agent.run(spec);
  return result.text;
}
