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
    case "verdict":
      return event.verdict === "pass"
        ? `✅ ${event.stage}: VERDICT PASS`
        : `❌ ${event.stage}: VERDICT FAIL`;
    case "handoff":
      return `📝 ${event.stage}: ${event.note}`;
    case "retry":
      return `🔁 ${event.stage}: retry attempt ${event.attempt}`;
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
