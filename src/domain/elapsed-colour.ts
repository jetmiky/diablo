/**
 * Colours an elapsed-time string by how close the current step is to its
 * timeout ceiling (`stepTimeoutMs`), so a watcher sees at a glance that a step
 * is taking unusually long — green well within budget, yellow past halfway, red
 * once it is about to be killed. Pure (no I/O): the caller passes the already-
 * formatted text, the raw elapsed ms, and the ceiling.
 *
 * Bands (fraction of the ceiling): < 0.5 green · 0.5–0.8 yellow · > 0.8 red.
 * The thresholds and the ceiling are parameters, not constants, because
 * `stepTimeoutMs` is configurable. When `colour` is false (non-TTY / NO_COLOR /
 * --plain) the text is returned unstyled. A non-positive ceiling means there is
 * no deadline to approach, so the text stays green rather than dividing by zero.
 */

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

const YELLOW_AT = 0.5;
const RED_AT = 0.8;

export function colourByElapsed(
  text: string,
  elapsedMs: number,
  ceilingMs: number,
  colour: boolean,
): string {
  if (!colour) return text;

  const fraction = ceilingMs > 0 ? elapsedMs / ceilingMs : 0;
  const code = fraction > RED_AT ? RED : fraction >= YELLOW_AT ? YELLOW : GREEN;
  return `${code}${text}${RESET}`;
}
