import { describe, expect, test } from "bun:test";
import { setupTelegram, type SetupTelegramDeps } from "../src/app/setup-telegram.ts";
import { parseTelegramCredentialsFile } from "../src/domain/telegram-credentials.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PromptPort } from "../src/ports/prompt.ts";

class FakeFs implements FsPort {
  files = new Map<string, string>();
  writes: string[] = [];
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }
  read(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
    return Promise.resolve(v);
  }
  write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    this.writes.push(path);
    return Promise.resolve();
  }
  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
}

/**
 * A scripted prompt that hands back canned free-text answers in order and
 * records the questions it was asked. confirm/select are unused here.
 */
class FakePrompt implements PromptPort {
  asked: string[] = [];
  private i = 0;
  constructor(private readonly answers: string[]) {}
  confirm(): Promise<boolean> {
    return Promise.resolve(false);
  }
  select(_q: string, options: readonly string[]): Promise<string> {
    return Promise.resolve(options[0]!);
  }
  ask(question: string): Promise<string> {
    this.asked.push(question);
    return Promise.resolve(this.answers[this.i++] ?? "");
  }
}

const CREDS_PATH = "/proj/.diablo/telegram.json";

function makeDeps(fs: FsPort, prompt: PromptPort) {
  const printed: string[] = [];
  const deps: SetupTelegramDeps = { fs, prompt, print: (line) => printed.push(line) };
  return { deps, printed };
}

describe("setupTelegram", () => {
  test("prompts for the bot token and chat id, then writes them to the credential file", async () => {
    const fs = new FakeFs();
    const prompt = new FakePrompt(["my-bot-token", "123456789"]);
    const { deps } = makeDeps(fs, prompt);

    const outcome = await setupTelegram(deps, { credentialsPath: CREDS_PATH });

    expect(outcome).toBe("written");
    expect(prompt.asked.join(" ").toLowerCase()).toContain("token");
    expect(prompt.asked.join(" ").toLowerCase()).toContain("chat");
    expect(parseTelegramCredentialsFile(fs.files.get(CREDS_PATH)!)).toEqual({
      botToken: "my-bot-token",
      chatId: "123456789",
    });
  });

  test("trims surrounding whitespace from the entered values", async () => {
    const fs = new FakeFs();
    const { deps } = makeDeps(fs, new FakePrompt(["  tok  ", "  chat  "]));

    await setupTelegram(deps, { credentialsPath: CREDS_PATH });

    expect(parseTelegramCredentialsFile(fs.files.get(CREDS_PATH)!)).toEqual({
      botToken: "tok",
      chatId: "chat",
    });
  });

  test("aborts without writing when the bot token is left blank", async () => {
    const fs = new FakeFs();
    const { deps, printed } = makeDeps(fs, new FakePrompt(["", "123456789"]));

    const outcome = await setupTelegram(deps, { credentialsPath: CREDS_PATH });

    expect(outcome).toBe("aborted");
    expect(fs.writes).not.toContain(CREDS_PATH);
    expect(printed.join(" ").toLowerCase()).toContain("token");
  });

  test("aborts without writing when the chat id is left blank", async () => {
    const fs = new FakeFs();
    const { deps, printed } = makeDeps(fs, new FakePrompt(["my-bot-token", "   "]));

    const outcome = await setupTelegram(deps, { credentialsPath: CREDS_PATH });

    expect(outcome).toBe("aborted");
    expect(fs.writes).not.toContain(CREDS_PATH);
    expect(printed.join(" ").toLowerCase()).toContain("chat");
  });

  test("overwrites an existing credential file with the new values", async () => {
    const fs = new FakeFs({ [CREDS_PATH]: '{ "botToken": "old", "chatId": "old" }' });
    const { deps } = makeDeps(fs, new FakePrompt(["new-tok", "new-chat"]));

    await setupTelegram(deps, { credentialsPath: CREDS_PATH });

    expect(parseTelegramCredentialsFile(fs.files.get(CREDS_PATH)!)).toEqual({
      botToken: "new-tok",
      chatId: "new-chat",
    });
  });
});
