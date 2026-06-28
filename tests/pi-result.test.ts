import { describe, expect, test } from "bun:test";
import { parsePiResult } from "../src/domain/pi-result.ts";

// Pi's `--mode json` is a JSONL event stream. The last `agent_end` line carries
// the full messages array plus per-message usage/cost. We parse the result from
// that, not from the prose, and ignore the streaming `message_update` noise.

const sampleJsonl = [
  `{"type":"session","version":3,"id":"abc","cwd":"/tmp"}`,
  `{"type":"agent_start"}`,
  `{"type":"message_start","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}`,
  `{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"PO"}}`,
  `{"type":"agent_end","messages":[` +
    `{"role":"user","content":[{"type":"text","text":"hi"}]},` +
    `{"role":"assistant","content":[{"type":"text","text":"<thinking>\\nweighing it\\n</thinking>\\n\\nPONG"}],` +
    `"model":"kr/claude-sonnet-4.5","stopReason":"stop",` +
    `"usage":{"input":7002,"output":39,"totalTokens":7041,"cost":{"total":0.012}}}` +
  `],"willRetry":false}`,
].join("\n");

describe("parsePiResult", () => {
  test("extracts the final assistant text from the agent_end event", () => {
    const result = parsePiResult(sampleJsonl);
    expect(result.text).toBe("PONG");
  });

  test("strips leaked <thinking> reasoning from the text", () => {
    const result = parsePiResult(sampleJsonl);
    expect(result.text).not.toContain("thinking");
    expect(result.text).not.toContain("weighing it");
  });

  test("surfaces usage and cost for benchmarking", () => {
    const result = parsePiResult(sampleJsonl);
    expect(result.usage.totalTokens).toBe(7041);
    expect(result.usage.cost).toBe(0.012);
  });

  test("reports the stop reason", () => {
    const result = parsePiResult(sampleJsonl);
    expect(result.stopReason).toBe("stop");
  });

  test("throws when there is no agent_end event (run did not complete)", () => {
    const incomplete = [
      `{"type":"agent_start"}`,
      `{"type":"message_start","message":{"role":"user","content":[]}}`,
    ].join("\n");
    expect(() => parsePiResult(incomplete)).toThrow(/no agent_end/i);
  });

  test("tolerates trailing whitespace and blank lines in the stream", () => {
    const result = parsePiResult("\n" + sampleJsonl + "\n\n  ");
    expect(result.text).toBe("PONG");
  });
});
