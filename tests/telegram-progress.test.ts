import { describe, expect, test } from "bun:test";
import { TelegramProgress } from "../src/adapters/telegram-progress.ts";
import type { TelegramClient } from "../src/ports/telegram-client.ts";

interface SendCall { kind: "send"; text: string; parseMode: string }
interface EditCall { kind: "edit"; messageId: number; text: string; parseMode: string }
type Call = SendCall | EditCall;

class FakeClient implements TelegramClient {
  calls: Call[] = [];
  private nextId = 100;
  sendMessage(text: string, parseMode: string): Promise<{ messageId: number }> {
    this.calls.push({ kind: "send", text, parseMode });
    return Promise.resolve({ messageId: this.nextId++ });
  }
  editMessageText(messageId: number, text: string, parseMode: string): Promise<void> {
    this.calls.push({ kind: "edit", messageId, text, parseMode });
    return Promise.resolve();
  }
  get sends(): SendCall[] {
    return this.calls.filter((c): c is SendCall => c.kind === "send");
  }
  get edits(): EditCall[] {
    return this.calls.filter((c): c is EditCall => c.kind === "edit");
  }
}

describe("TelegramProgress — discrete events", () => {
  test("posts each discrete event as a fresh HTML message", async () => {
    const client = new FakeClient();
    const adapter = new TelegramProgress(client);
    await adapter.emit({ kind: "committed", stage: "stage-1", sha: "a1b2c3d4e5f6" });

    expect(client.sends).toHaveLength(1);
    expect(client.sends[0]!.parseMode).toBe("HTML");
    expect(client.sends[0]!.text).toContain("<code>");
    expect(client.sends[0]!.text).toContain("a1b2c3d");
    expect(client.sends[0]!.text).not.toContain("`");
  });

  test("escapes HTML-special characters in the halt reason", async () => {
    const client = new FakeClient();
    const adapter = new TelegramProgress(client);
    await adapter.emit({ kind: "halted", reason: "tsc failed: a < b in <T>" });

    expect(client.sends[0]!.text).toContain("&lt;");
    expect(client.sends[0]!.text).not.toMatch(/<T>/);
  });

  test("renders bold markup as <b> (not raw asterisks)", async () => {
    const client = new FakeClient();
    const adapter = new TelegramProgress(client);
    await adapter.emit({ kind: "stage-done", stage: "stage-1", title: "Scaffold" });

    expect(client.sends[0]!.text).toContain("<b>Scaffold</b>");
    expect(client.sends[0]!.text).not.toContain("**");
  });
});

describe("TelegramProgress — heartbeat live bubble", () => {
  test("the first heartbeat opens one bubble (send), later ones edit it in place", async () => {
    let clock = 0;
    const client = new FakeClient();
    const adapter = new TelegramProgress(client, { now: () => clock, throttleMs: 15_000 });

    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 1_000 });
    clock = 15_000;
    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 16_000 });

    expect(client.sends).toHaveLength(1); // only one bubble created
    expect(client.edits).toHaveLength(1); // second tick edits it
    expect(client.edits[0]!.messageId).toBe(100);
    expect(client.edits[0]!.text).toMatch(/16s|0m16s/);
  });

  test("heartbeats inside the throttle window are dropped (no edit storm)", async () => {
    let clock = 0;
    const client = new FakeClient();
    const adapter = new TelegramProgress(client, { now: () => clock, throttleMs: 15_000 });

    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 1_000 }); // opens bubble
    clock = 3_000;
    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 3_000 }); // <15s → drop
    clock = 8_000;
    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 8_000 }); // <15s → drop

    expect(client.sends).toHaveLength(1);
    expect(client.edits).toHaveLength(0);
  });

  test("a discrete event closes the bubble: the next heartbeat opens a NEW one", async () => {
    let clock = 0;
    const client = new FakeClient();
    const adapter = new TelegramProgress(client, { now: () => clock, throttleMs: 15_000 });

    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 1_000 }); // bubble #100
    await adapter.emit({ kind: "committed", stage: "stage-1", sha: "deadbeef0000" }); // discrete → closes bubble
    clock = 30_000;
    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 30_000 }); // new bubble #101

    expect(client.sends).toHaveLength(3); // heartbeat-open, committed, heartbeat-open-again
    const heartbeatSends = client.sends.filter((s) => s.text.includes("elapsed"));
    expect(heartbeatSends).toHaveLength(2);
    // committed posted as its own message, not an edit of the bubble
    expect(client.sends[1]!.text).toContain("deadbee");
  });
});
