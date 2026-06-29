/**
 * Classifies a human's turn input during plan negotiation. The human's text is
 * free-form, but we detect explicit approval/reopen tokens to drive the state
 * machine — never infer approval from vague positivity (anti-sycophancy applies
 * to the human side too: only an explicit token freezes).
 *
 * Returns:
 *   "approve"   — the input is exactly "approve" (case-insensitive, optionally
 *                 prefixed with `/`): freeze the plan.
 *   "reopen"    — the input is exactly "reopen" (case-insensitive, optionally
 *                 prefixed with `/`): reopen a frozen plan.
 *   "challenge" — anything else, including phrases that CONTAIN "approve" or
 *                 "reopen" but aren't the bare token. Treated as a challenge
 *                 to the plan, prompting a negotiation turn.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

export type TurnIntent = "approve" | "reopen" | "challenge";

export function classifyTurn(input: string): TurnIntent {
  // Trim whitespace
  let normalized = input.trim();

  // Optionally strip leading slash
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }

  // Check for exact tokens (case-insensitive)
  const lower = normalized.toLowerCase();
  if (lower === "approve") return "approve";
  if (lower === "reopen") return "reopen";

  // Everything else is a challenge
  return "challenge";
}
