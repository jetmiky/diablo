import { describe, expect, test } from "bun:test";
import { parsePiThought } from "../src/domain/pi-thought.ts";

/** Build a message_update line carrying an assistantMessageEvent delta. */
function deltaLine(type: string, delta: string): string {
  return JSON.stringify({
    type: "message_update",
    assistantMessageEvent: { type, contentIndex: 0, delta },
  });
}

describe("parsePiThought", () => {
  test("surfaces a text_delta as a thinking label", () => {
    const label = parsePiThought(deltaLine("text_delta", "Let me check the parser"));
    expect(label).toBe("Let me check the parser");
  });

  test("surfaces a thinking_delta the same way", () => {
    expect(parsePiThought(deltaLine("thinking_delta", "weighing options"))).toBe("weighing options");
  });

  test("collapses internal whitespace/newlines to a single line", () => {
    expect(parsePiThought(deltaLine("text_delta", "line one\n  line two"))).toBe("line one line two");
  });

  test("clips a long delta so the line stays short", () => {
    const long = "x".repeat(200);
    const label = parsePiThought(deltaLine("text_delta", long))!;
    expect(label.length).toBeLessThanOrEqual(70);
    expect(label.endsWith("…")).toBe(true);
  });

  test("returns undefined for a non-delta assistantMessageEvent (e.g. text_start)", () => {
    expect(parsePiThought(deltaLine("text_start", ""))).toBeUndefined();
  });

  test("returns undefined for a toolcall_delta (tool activity is handled elsewhere)", () => {
    expect(parsePiThought(deltaLine("toolcall_delta", "{...}"))).toBeUndefined();
  });

  test("returns undefined for an unrelated event type", () => {
    expect(parsePiThought(JSON.stringify({ type: "tool_execution_start", toolName: "edit" }))).toBeUndefined();
  });

  test("returns undefined for a blank or non-JSON line (never throws)", () => {
    expect(parsePiThought("")).toBeUndefined();
    expect(parsePiThought("   ")).toBeUndefined();
    expect(parsePiThought("{not json")).toBeUndefined();
  });

  test("returns undefined when the delta is empty or whitespace-only", () => {
    expect(parsePiThought(deltaLine("text_delta", ""))).toBeUndefined();
    expect(parsePiThought(deltaLine("text_delta", "   "))).toBeUndefined();
  });
});
