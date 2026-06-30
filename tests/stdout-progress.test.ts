import { describe, expect, test } from "bun:test";
import { StdoutProgress } from "../src/adapters/stdout-progress.ts";
import type { ProgressEvent } from "../src/ports/progress.ts";

/** Collects everything written so a test can assert on the exact byte stream. */
function recorder() {
  const chunks: string[] = [];
  return {
    write: (s: string) => void chunks.push(s),
    get output() {
      return chunks.join("");
    },
    get chunks() {
      return chunks;
    },
  };
}

const started: ProgressEvent = {
  kind: "stage-started",
  stage: "stage-1",
  title: "Wire the parser",
  index: 1,
  total: 3,
};
const heartbeat: ProgressEvent = { kind: "heartbeat", stage: "stage-1", elapsedMs: 5000 };

describe("StdoutProgress", () => {
  test("a discrete event prints one newline-terminated line", async () => {
    const rec = recorder();
    const sink = new StdoutProgress({ colour: false, animate: false }, rec.write);
    await sink.emit(started);
    expect(rec.output.endsWith("\n")).toBe(true);
    expect(rec.output).toContain("Wire the parser");
  });

  test("with colour off, no markdown asterisks leak into the output", async () => {
    const rec = recorder();
    const sink = new StdoutProgress({ colour: false, animate: false }, rec.write);
    await sink.emit(started);
    expect(rec.output).not.toContain("**");
  });

  test("with colour on, the title is wrapped in ANSI bold", async () => {
    const rec = recorder();
    const sink = new StdoutProgress({ colour: true, animate: false }, rec.write);
    await sink.emit(started);
    expect(rec.output).toContain("\x1b[1mWire the parser\x1b[0m");
  });

  test("when animation is off, heartbeats are suppressed (no spinner spam in a piped log)", async () => {
    const rec = recorder();
    const sink = new StdoutProgress({ colour: false, animate: false }, rec.write);
    await sink.emit(heartbeat);
    expect(rec.output).toBe("");
  });

  test("when animation is off, output carries no carriage returns", async () => {
    const rec = recorder();
    const sink = new StdoutProgress({ colour: false, animate: false }, rec.write);
    await sink.emit(started);
    await sink.emit(heartbeat);
    await sink.emit({ kind: "stage-done", stage: "stage-1", title: "Wire the parser" });
    expect(rec.output).not.toContain("\r");
  });

  test("when animation is on, a heartbeat redraws in place with a carriage return", async () => {
    const rec = recorder();
    const sink = new StdoutProgress({ colour: false, animate: true }, rec.write);
    await sink.emit(heartbeat);
    expect(rec.output).toContain("\r");
  });

  test("when animation is on, a discrete event after a spinner breaks the line first", async () => {
    const rec = recorder();
    const sink = new StdoutProgress({ colour: false, animate: true }, rec.write);
    await sink.emit(heartbeat); // opens a spinner line
    await sink.emit({ kind: "committed", stage: "stage-1", sha: "a1b2c3d4567" });
    // The chunk written for the discrete event must start by closing the spinner line.
    expect(rec.chunks.at(-1)!.startsWith("\n")).toBe(true);
  });
});
