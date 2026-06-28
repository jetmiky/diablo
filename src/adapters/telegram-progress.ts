/**
 * TelegramProgress is a ProgressPort that posts each event to Telegram as
 * cleanly rendered HTML. It formats the event to a markdown line (shared with
 * the stdout sink), converts that to Telegram's HTML tag subset, and posts via
 * an injected TelegramClient. Read-only push notifications — two-way approval
 * over Telegram is out of scope (deferred).
 */
import type { ProgressEvent, ProgressPort } from "../ports/progress.ts";
import type { TelegramClient } from "../ports/telegram-client.ts";
import { formatEvent } from "../domain/progress-message.ts";
import { renderTelegramHtml } from "../domain/telegram-html.ts";

export class TelegramProgress implements ProgressPort {
  constructor(private readonly client: TelegramClient) {}

  async emit(event: ProgressEvent): Promise<void> {
    const html = renderTelegramHtml(formatEvent(event));
    await this.client.sendMessage(html, "HTML");
  }
}
