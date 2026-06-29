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

  async sendMessage(text: string, parseMode: string): Promise<{ messageId: number }> {
    const result = await this.callApi<{ message_id: number }>("sendMessage", {
      chat_id: this.chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    });
    return { messageId: result.message_id };
  }

  async editMessageText(messageId: number, text: string, parseMode: string): Promise<void> {
    await this.callApi<unknown>("editMessageText", {
      chat_id: this.chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    });
  }

  /**
   * POST a Bot API method with a JSON body, returning its `result`. A non-2xx
   * response throws so the fan-out sink can swallow it (progress is best-effort)
   * while a real misconfiguration is still surfaced in logs during development.
   */
  private async callApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const url = `https://api.telegram.org/bot${this.botToken}/${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Telegram ${method} failed: ${res.status} ${res.statusText} ${errBody}`.trim(),
      );
    }
    const json = (await res.json().catch(() => ({}))) as { result?: T };
    return json.result as T;
  }
}
