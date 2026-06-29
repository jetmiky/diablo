/**
 * formatEvent turns a progress event into a single human-readable markdown line.
 * Shared by the stdout sink (printed as-is) and the Telegram sink (which then
 * runs it through renderTelegramHtml). Pure (no I/O) so it is unit-tested
 * directly and both sinks render identical content.
 */
import type { ProgressEvent } from "../ports/progress.ts";

export function formatEvent(event: ProgressEvent): string {
  switch (event.kind) {
    case "stage-started":
      return `▶️ stage ${event.index}/${event.total}: **${event.title}** (${event.stage}) started`;
    case "design-running":
      return `✏️ ${event.stage}: designing`;
    case "worker-running":
      return `🛠️ ${event.stage}: implementing`;
    case "verifier-running":
      return `🔍 ${event.stage}: verifying`;
    case "committed":
      return `📌 ${event.stage}: committed \`${event.sha.slice(0, 7)}\``;
    case "scope-warning":
      return `⚠️ ${event.stage}: committed file(s) outside the declared scope — ${event.files.join(", ")}`;
    case "verdict":
      return event.verdict === "pass"
        ? `✅ ${event.stage}: VERDICT PASS`
        : `❌ ${event.stage}: VERDICT FAIL`;
    case "handoff":
      return `📝 ${event.stage}: ${event.note}`;
    case "retry":
      return `🔁 ${event.stage}: retry attempt ${event.attempt}`;
    case "heartbeat": {
      const elapsed = formatDuration(event.elapsedMs);
      return event.activity
        ? `⏳ ${event.stage}: ${event.activity} · ${elapsed} elapsed`
        : `⏳ ${event.stage}: working · ${elapsed} elapsed`;
    }
    case "stage-done":
      return `🏁 stage **${event.title}** (${event.stage}) done`;
    case "waiting-for-approval":
      return `⏸ ${event.stage}: awaiting approval (idle)`;
    case "done":
      return event.commit
        ? `🎉 run complete — final commit \`${event.commit.slice(0, 7)}\``
        : `🎉 run complete`;
    case "halted":
      return `🛑 run halted — ${event.reason}`;
  }
}

/**
 * Formats a millisecond duration as a compact human string: "45s", "2m5s",
 * "1h3m". Seconds are dropped once past an hour (minute resolution is enough
 * for a long run). Used by the heartbeat line so the user sees how long the
 * current step has been running.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m${seconds}s`;
  return `${seconds}s`;
}
