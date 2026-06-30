/**
 * Resolves what the stdout sink is allowed to do — use colour, and animate the
 * spinner in place — from the terminal's capabilities and the user's overrides.
 * Pure (no I/O): main.ts reads `process.stdout.isTTY` and the environment, then
 * passes the booleans here, so the precedence rules are unit-tested directly.
 *
 * Precedence, highest first:
 *   - `--plain` → the plainest output: no colour, no animation, regardless of TTY.
 *   - colour: NO_COLOR off-switch wins over FORCE_COLOR; absent both, colour
 *     follows the TTY. (NO_COLOR / FORCE_COLOR are the cross-tool conventions.)
 *   - animation: only ever on a real TTY — in-place carriage-return redraws are
 *     garbage in a piped/CI log. FORCE_COLOR colours a non-TTY but never animates
 *     it (a redirected stream still must not carry spinner frames).
 */

export interface CapabilityInputs {
  /** process.stdout.isTTY — false when piped, redirected, or in CI. */
  isTty: boolean;
  /** NO_COLOR present (any value) — the standard "disable colour" off-switch. */
  noColor: boolean;
  /** FORCE_COLOR present — force colour even when not a TTY. */
  forceColor: boolean;
  /** The --plain run flag — force the plainest possible output. */
  plain: boolean;
}

export interface StdoutCapabilities {
  /** Emit ANSI colour/style escapes. */
  colour: boolean;
  /** Animate the spinner in place (carriage returns); only safe on a TTY. */
  animate: boolean;
}

export function resolveStdoutCapabilities(inputs: CapabilityInputs): StdoutCapabilities {
  if (inputs.plain) return { colour: false, animate: false };

  const colour = inputs.noColor ? false : inputs.forceColor ? true : inputs.isTty;
  const animate = inputs.isTty;

  return { colour, animate };
}
