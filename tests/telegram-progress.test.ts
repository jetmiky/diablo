import { describe, expect, test } from "bun:test";
import { TelegramProgress } from "../src/adapters/telegram-progress.ts";
import type { TelegramClient } from "../src/ports/telegram-client.ts";

class FakeClient implements TelegramClient {
  posts: Array<{ text: string; parseMode: string }> = [];
  sendMessage(text: string, parseMode: string): Promise<void> {
    this.posts.push({ text, parseMode });
    return Promise.resolve();
  }
}

describe("TelegramProgress", () => {
  test("posts each event as HTML, escaping path/code-heavy content", async () => {
    const client = new FakeClient();
    const adapter = new TelegramProgress(client);
    await adapter.emit({ kind: "committed", stage: "stage-1", sha: "a1b2c3d4e5f6" });

    expect(client.posts).toHaveLength(1);
    expect(client.posts[0]!.parseMode).toBe("HTML");
    // the short sha rendered inside <code>, no raw markdown backticks
    expect(client.posts[0]!.text).toContain("<code>");
    expect(client.posts[0]!.text).toContain("a1b2c3d");
    expect(client.posts[0]!.text).not.toContain("`");
  });

  test("escapes HTML-special characters in the halt reason", async () => {
    const client = new FakeClient();
    const adapter = new TelegramProgress(client);
    await adapter.emit({ kind: "halted", reason: "tsc failed: a < b in <T>" });

    expect(client.posts[0]!.text).toContain("&lt;");
    expect(client.posts[0]!.text).not.toMatch(/<T>/); // raw angle brackets escaped
  });

  test("renders bold markup as <b> (not raw asterisks)", async () => {
    const client = new FakeClient();
    const adapter = new TelegramProgress(client);
    await adapter.emit({ kind: "stage-done", stage: "stage-1", title: "Scaffold" });

    expect(client.posts[0]!.text).toContain("<b>Scaffold</b>");
    expect(client.posts[0]!.text).not.toContain("**");
  });
});
