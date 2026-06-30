/**
 * Maps a Pi activity label to a distinguishing glyph for the heartbeat line.
 *
 * The heartbeat carries the activity as a LABEL STRING (e.g. "editing
 * run-step.ts"), not a structured kind — that is all that survives the
 * pi-agent → run-step → heartbeat pipeline. Rather than replumb a structured
 * activity-kind through the whole event chain (event shape, pi-agent, the
 * Telegram sink) for a cosmetic glyph, we key off the label's LEADING VERB,
 * which `pi-activity` produces as a stable contract ("editing"/"reading"/
 * "writing"/"running"/"searching"/"finding"/"listing"). Presentation stays in
 * this render-layer helper; the domain label stays text-only.
 *
 * Pure and total: an unrecognised or empty label degrades to a generic gear
 * rather than throwing.
 */

const GENERIC = "⚙️";

const VERB_GLYPHS: Record<string, string> = {
  editing: "✏️",
  reading: "📖",
  writing: "📝",
  running: "⚡",
  searching: "🔍",
  finding: "🧭",
  listing: "📂",
};

export function activityGlyph(label: string): string {
  const verb = label.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  return VERB_GLYPHS[verb] ?? GENERIC;
}
