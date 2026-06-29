/**
 * TelegramClient is the seam for posting to a Telegram chat. The real adapter
 * calls the Bot API over HTTP; tests use a fake that records calls. The progress
 * adapter depends only on this, so no network is touched in unit tests and no
 * credentials are needed to test the rendering.
 *
 * `sendMessage` returns the new message's id so a sink can EDIT it in place —
 * the basis of the live "heartbeat" bubble (one message that ticks an elapsed
 * timer rather than spamming a new line every few seconds). `editMessageText`
 * updates an existing message; both are needed for the live-bubble behaviour.
 */
export interface TelegramClient {
  /** Post a message; resolves with its id. parseMode is "HTML" for diablo. */
  sendMessage(text: string, parseMode: string): Promise<{ messageId: number }>;
  /** Edit an existing message in place (used to tick the live heartbeat bubble). */
  editMessageText(messageId: number, text: string, parseMode: string): Promise<void>;
}
