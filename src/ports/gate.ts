/**
 * GatePort is the human-checkpoint seam. After a step produces (and commits)
 * work, an `approval` gate asks the human whether to proceed. The real adapter
 * reads stdin; tests use a fake that returns canned decisions.
 *
 * Declining is a clean halt — the committed work stays on the worktree branch
 * and the pipeline stops. It is signalled with GateDeclinedError so callers can
 * distinguish "the human stopped it" from "the agent errored".
 */
import type { Tier } from "../domain/run-spec.ts";

export type GateMode = "none" | "approval";

export interface GateRequest {
  tier: Tier;
  issue: string;
  stage: string;
  /** The agent result text the human is approving. */
  summary: string;
  /** The commit the step produced, if any. */
  commit?: string;
}

export interface GatePort {
  /** Returns true to proceed, false to halt the pipeline. */
  confirm(request: GateRequest): Promise<boolean>;
}

export class GateDeclinedError extends Error {
  constructor(
    readonly issue: string,
    readonly stage: string,
    readonly tier: Tier,
  ) {
    super(`Gate declined at ${tier} step (${issue}/${stage}); pipeline halted by user.`);
    this.name = "GateDeclinedError";
  }
}
