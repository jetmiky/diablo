import { describe, expect, test } from "bun:test";
import { parsePiActivity } from "../src/domain/pi-activity.ts";

/**
 * parsePiActivity reads ONE line of Pi's `--mode json` JSONL stream and, when
 * that line is a `tool_execution_start` event, returns a short human label of
 * what the agent is doing right now (to fill the heartbeat's `activity` field).
 * Any other event — or a non-JSON line — yields undefined. Event/arg shapes are
 * taken verbatim from Pi's docs/json.md and its built-in tool definitions.
 */
describe("parsePiActivity", () => {
  function toolStart(toolName: string, args: unknown): string {
    return JSON.stringify({ type: "tool_execution_start", toolCallId: "t1", toolName, args });
  }

  test("returns undefined for non-tool events", () => {
    expect(parsePiActivity(JSON.stringify({ type: "agent_start" }))).toBeUndefined();
    expect(parsePiActivity(JSON.stringify({ type: "turn_start" }))).toBeUndefined();
    expect(
      parsePiActivity(
        JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "hi" } }),
      ),
    ).toBeUndefined();
  });

  test("returns undefined for a blank or non-JSON line", () => {
    expect(parsePiActivity("")).toBeUndefined();
    expect(parsePiActivity("   ")).toBeUndefined();
    expect(parsePiActivity("not json {")).toBeUndefined();
  });

  test("bash → shows the command being run", () => {
    expect(parsePiActivity(toolStart("bash", { command: "bun test" }))).toBe("running `bun test`");
  });

  test("edit/read/write → show the file's basename, not the full path", () => {
    expect(parsePiActivity(toolStart("edit", { path: "/proj/src/app/run-step.ts" }))).toBe(
      "editing run-step.ts",
    );
    expect(parsePiActivity(toolStart("read", { path: "/proj/src/domain/heartbeat.ts" }))).toBe(
      "reading heartbeat.ts",
    );
    expect(parsePiActivity(toolStart("write", { path: "src/foo.ts", content: "x" }))).toBe(
      "writing foo.ts",
    );
  });

  test("grep/find → show the search pattern", () => {
    expect(parsePiActivity(toolStart("grep", { pattern: "TODO" }))).toBe("searching for “TODO”");
    expect(parsePiActivity(toolStart("find", { pattern: "*.test.ts" }))).toBe("finding “*.test.ts”");
  });

  test("ls → shows the directory being listed", () => {
    expect(parsePiActivity(toolStart("ls", { path: "/proj/src" }))).toBe("listing src");
  });

  test("an unknown tool falls back to the bare tool name", () => {
    expect(parsePiActivity(toolStart("web_fetch", { url: "https://x" }))).toBe("running web_fetch");
  });

  test("a long bash command is truncated so the heartbeat line stays short", () => {
    const long = "x".repeat(200);
    const label = parsePiActivity(toolStart("bash", { command: long }))!;
    expect(label.length).toBeLessThanOrEqual(70);
    expect(label).toMatch(/…`?$/);
  });

  test("missing or malformed args degrade to the bare verb (never throws)", () => {
    expect(parsePiActivity(toolStart("edit", {}))).toBe("editing");
    expect(parsePiActivity(toolStart("bash", {}))).toBe("running command");
    expect(parsePiActivity(toolStart("grep", null))).toBe("searching");
  });
});
