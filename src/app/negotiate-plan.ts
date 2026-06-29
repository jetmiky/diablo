/**
 * Negotiate-plan use-case: the interactive negotiation loop for plan proposal
 * and challenge/approval. Driven by injected ports (agent, fs, prompt, print)
 * so it is fully testable with fakes — the actual stdin/stdout binding is the
 * orchestrator's job.
 */
import type { AgentPort } from "../ports/agent.ts";
import type { FsPort } from "../ports/fs.ts";
import type { PromptPort } from "../ports/prompt.ts";
import type { PlanSessionConfig } from "./plan-session.ts";
import { proposePlan, negotiateTurn } from "./plan-session.ts";
import { freezePlan } from "./freeze-plan.ts";
import { classifyTurn } from "../domain/approval.ts";

export interface NegotiatePlanDeps {
  agent: AgentPort;
  fs: FsPort;
  prompt: PromptPort;
  print: (line: string) => void;
}

export interface NegotiatePlanConfig extends PlanSessionConfig {
  diabloDir: string;
}

/**
 * Runs the interactive plan negotiation loop: proposes a plan, then loops
 * asking the user for challenges or approval. On explicit approval, freezes
 * the plan and persists status as "planned". On abort, returns without
 * freezing. Returns "frozen" if approved, "aborted" if cancelled.
 */
export async function negotiatePlan(
  deps: NegotiatePlanDeps,
  config: NegotiatePlanConfig,
): Promise<"frozen" | "aborted"> {
  // 1. Propose the initial plan
  const summary = await proposePlan({ agent: deps.agent, fs: deps.fs }, config);
  deps.print(summary);

  // 2. Loop: ask for input, classify, and respond
  while (true) {
    const input = await deps.prompt.ask(
      "Your response (challenge the plan, or type 'approve' to freeze, 'abort' to cancel):",
    );

    // Check for abort (exact match, case-insensitive, optional leading /)
    const normalized = input.trim().toLowerCase();
    const withoutSlash = normalized.startsWith("/") ? normalized.slice(1) : normalized;
    if (withoutSlash === "abort") {
      return "aborted";
    }

    // Classify the turn
    const intent = classifyTurn(input);

    if (intent === "approve") {
      // Freeze the plan and persist status
      await freezePlan(
        { agent: deps.agent, fs: deps.fs },
        {
          issue: config.issue,
          worktree: config.worktree,
          planPath: config.planPath,
          diabloDir: config.diabloDir,
          plannerSkills: config.plannerSkills,
          runId: config.runId,
        },
      );
      deps.print("Plan frozen. Status: planned.");
      return "frozen";
    }

    // For "reopen" or "challenge", negotiate a turn (during proposal/draft,
    // reopen is effectively a challenge since the plan is already a draft)
    const reply = await negotiateTurn({ agent: deps.agent, fs: deps.fs }, config, input);
    deps.print(reply);
  }
}
