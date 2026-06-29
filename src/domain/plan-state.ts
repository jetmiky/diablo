/**
 * The plan-negotiation state machine. A plan moves through:
 *
 *   no-plan → draft (via propose) → frozen (via approve)
 *
 * Revise keeps draft as draft. Reopen moves frozen back to draft. The state
 * can only reach frozen via explicit approve from draft — never inferred.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

export type PlanState = "no-plan" | "draft" | "frozen";

export type PlanAction = "propose" | "revise" | "approve" | "reopen";

export function nextPlanState(current: PlanState, action: PlanAction): PlanState {
  if (current === "no-plan") {
    if (action === "propose") return "draft";
    throw new Error(`Cannot ${action} from no-plan`);
  }

  if (current === "draft") {
    if (action === "propose") return "draft";
    if (action === "revise") return "draft";
    if (action === "approve") return "frozen";
    throw new Error(`Cannot ${action} from draft`);
  }

  if (current === "frozen") {
    if (action === "reopen") return "draft";
    throw new Error(`Cannot ${action} from frozen`);
  }

  throw new Error(`Unknown state: ${current}`);
}
