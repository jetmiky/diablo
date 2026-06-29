import { describe, expect, test } from "bun:test";
import { StdoutProgress } from "../src/adapters/stdout-progress.ts";

/** Collect everything written so we can assert on carriage returns / newlines. */
function sink() {
  const chunks: string[] = [];
  return { chunks, write: (s: string) => void chunks.push(s) };
}

describe("StdoutProgress — discrete events", () => {
  test("writes a discrete event as its own newline-terminated line", async () => {
    const out = sink();
    const adapter = new StdoutProgress(out.write);
    await adapter.emit({ kind: "committed", stage: "stage-1", sha: "a1b2c3d4e5f6" });

    expect(out.chunks.join("")).toContain("a1b2c3d");
    expect(out.chunks.join("")).toMatch(/\n$/);
  });
});

describe("StdoutProgress — heartbeat spinner", () => {
  test("overwrites the same line with a carriage return (no newline) and shows elapsed", async () => {
    const out = sink();
    const adapter = new StdoutProgress(out.write);
    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 5_000 });

    const written = out.chunks.join("");
    expect(written).toStartWith("\r");
    expect(written).not.toMatch(/\n$/); // stays on the same line
    expect(written).toMatch(/5s/);
  });

  test("cycles the spinner glyph across successive ticks", async () => {
    const out = sink();
    const adapter = new StdoutProgress(out.write);
    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 1_000 });
    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 2_000 });

    const glyphs = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const first = glyphs.find((g) => out.chunks[0]!.includes(g));
    const second = glyphs.find((g) => out.chunks[1]!.includes(g));
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second); // animated, not static
  });

  test("a discrete event after a spinner tick breaks to a fresh line first", async () => {
    const out = sink();
    const adapter = new StdoutProgress(out.write);
    await adapter.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 1_000 }); // spinner active
    await adapter.emit({ kind: "verdict", stage: "stage-1", verdict: "pass" }); // discrete

    // The discrete line must not be glued onto the spinner line; a newline
    // separates them so the spinner's last frame is left intact above.
    const discrete = out.chunks[out.chunks.length - 1]!;
    expect(discrete).toMatch(/\n/);
  });
});
