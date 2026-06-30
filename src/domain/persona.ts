/**
 * Personas give diablo's three tiers a face on stdout: the planner sketches, the
 * worker builds, the verifier pokes holes. This is the "cute words" layer — it
 * is purely cosmetic and stdout-only (the Telegram sink keeps neutral wording),
 * gated by the `fun` capability the caller resolves. Pure (no I/O) so it is
 * unit-tested directly.
 *
 * Rotation is DETERMINISTIC on (stage, bucket): the caller passes a bucket
 * derived from a coarse time slice (e.g. floor(elapsedMs / 15000)) so the phrase
 * changes every ~15s but never flickers on the 1s heartbeat tick. The verifier
 * phrasing stays skeptical, echoing the engine's anti-sycophancy posture.
 */

/** The tier whose work a heartbeat/running event describes. */
export type PersonaTier = "design" | "worker" | "verifier";

export const PERSONA_GLYPHS: Record<PersonaTier, string> = {
  design: "🧠",
  worker: "🔨",
  verifier: "🕵️",
};

const PHRASES: Record<PersonaTier, readonly string[]> = {
  design: ["plotting the route", "sketching the approach", "thinking it through"],
  worker: ["hands on keyboard", "wiring it up", "making it real"],
  verifier: ["poking holes", "calling its bluff", "checking the work"],
};

/** Flavor text for the heartbeat fallback when no real activity is known. */
const FLAVOR: readonly string[] = [
  "warming up the conductor",
  "reading the room",
  "consulting the plan",
  "turning the crank",
  "keeping the beat",
];

/** Picks an element by bucket, wrapping — deterministic for a given bucket. */
function pick<T>(items: readonly T[], bucket: number): T {
  const i = ((bucket % items.length) + items.length) % items.length;
  return items[i]!;
}

/** A persona-flavored "this tier is working" line: `🔨 stage-1: wiring it up`. */
export function personaLine(tier: PersonaTier, stage: string, bucket: number): string {
  return `${PERSONA_GLYPHS[tier]} ${stage}: ${pick(PHRASES[tier], bucket)}`;
}

/** A verdict line with personality (semantics preserved by the caller's log). */
export function verdictLine(verdict: "pass" | "fail", stage: string): string {
  return verdict === "pass"
    ? `✅ ${stage}: nailed it`
    : `❌ ${stage}: not yet — back to the bench`;
}

/** A retry line with personality, naming the attempt. */
export function retryLine(stage: string, attempt: number): string {
  return `🔁 ${stage}: round ${attempt}, fix incoming`;
}

/** Rotating flavor text for the heartbeat fallback (no known activity). */
export function flavorText(stage: string, bucket: number): string {
  return pick(FLAVOR, bucket);
}
