/**
 * TelegramClient is the seam for posting a message to a Telegram chat. The real
 * adapter calls the Bot API over HTTP; tests use a fake that records posts. The
 * progress adapter depends only on this, so no network is touched in unit tests
 * and no credentials are needed to test the rendering.
 */
export interface TelegramClient {
  /** Post a message. parseMode is "HTML" for diablo (the supported tag subset). */
  sendMessage(text: string, parseMode: string): Promise<void>;
}
