/**
 * TelegramProgress is a ProgressPort that posts run progress to Telegram as
 * cleanly rendered HTML. It handles two kinds of event differently:
 *
 *   - DISCRETE lifecycle events (stage-started, committed, verdict, done, ...)
 *     are posted as their own fresh message — the durable run narrative.
 *
 *   - HEARTBEAT ticks drive a single LIVE BUBBLE: the first tick of a step
 *     sends one message, and subsequent ticks EDIT that same message in place
 *     so the user sees an elapsed timer advance without the chat filling up
 *     with a new line every few seconds. Telegram throttles edits, so ticks
 *     inside a throttle window (default 15s) are dropped rather than sent.
 *
 * A discrete event CLOSES the active bubble: the next heartbeat opens a new one.
 * That keeps the live timer attached to the current activity and prevents a
 * stale bubble from ticking after the step it described has moved on.
 *
 * Read-only push notifications by design: approval stays on stdin (interactive
 * runs) or off entirely (unattended runs use gate: none, with the verifier as
 * the automated checkpoint), so there is no inbound Telegram channel to build.
 * All sends are best-effort by virtue of the fan-out sink swallowing errors;
 * this adapter focuses on WHAT to render.
 */
import type { ProgressEvent, ProgressPort } from "../ports/progress.ts";
import type { TelegramClient } from "../ports/telegram-client.ts";
import { formatEvent } from "../domain/progress-message.ts";
import { renderTelegramHtml } from "../domain/telegram-html.ts";

/** Minimum gap between live-bubble edits. Telegram throttles edits per chat. */
const DEFAULT_THROTTLE_MS = 15_000;

export interface TelegramProgressDeps {
  /** Minimum ms between heartbeat-bubble edits. Default 15000. */
  throttleMs?: number;
  /** Clock, injectable for tests. Default Date.now. */
  now?: () => number;
}

export class TelegramProgress implements ProgressPort {
  private readonly throttleMs: number;
  private readonly now: () => number;

  /** The live heartbeat bubble's message id, while one is open. */
  private bubbleId: number | undefined;
  /** When the bubble was last sent/edited, to enforce the throttle window. */
  private lastEditAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly client: TelegramClient,
    deps: TelegramProgressDeps = {},
  ) {
    this.throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.now = deps.now ?? Date.now;
  }

  async emit(event: ProgressEvent): Promise<void> {
    if (event.kind === "heartbeat") {
      await this.emitHeartbeat(event);
      return;
    }
    // Any discrete event ends the current live bubble so the next heartbeat
    // starts a fresh one attached to the new activity.
    this.closeBubble();
    const html = renderTelegramHtml(formatEvent(event));
    await this.client.sendMessage(html, "HTML");
  }

  private async emitHeartbeat(event: ProgressEvent & { kind: "heartbeat" }): Promise<void> {
    const html = renderTelegramHtml(formatEvent(event));

    // No bubble yet: open one immediately and start the throttle window.
    if (this.bubbleId === undefined) {
      const { messageId } = await this.client.sendMessage(html, "HTML");
      this.bubbleId = messageId;
      this.lastEditAt = this.now();
      return;
    }

    // Bubble open: edit it in place, but only once per throttle window so a
    // 1s base cadence does not become an edit storm Telegram would reject.
    if (this.now() - this.lastEditAt < this.throttleMs) return;
    this.lastEditAt = this.now();
    await this.client.editMessageText(this.bubbleId, html, "HTML");
  }

  private closeBubble(): void {
    this.bubbleId = undefined;
    this.lastEditAt = Number.NEGATIVE_INFINITY;
  }
}
