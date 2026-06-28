/**
 * TelegramBotClient is the live TelegramClient: it posts a message to a chat via
 * the Bot API using the global fetch (available in Node 22+ and Bun, so no extra
 * dependency). Credentials are passed in by the composition root — never read or
 * committed here. A non-2xx response throws so the fan-out sink can swallow it
 * (progress is best-effort) while a real misconfiguration is still surfaced in
 * logs during development.
 */
import type { TelegramClient } from "../ports/telegram-client.ts";

export class TelegramBotClient implements TelegramClient {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  async sendMessage(text: string, parseMode: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Telegram sendMessage failed: ${res.status} ${res.statusText} ${body}`.trim());
    }
  }
}
