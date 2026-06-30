import { describe, expect, test } from "bun:test";
import { StdoutProgress } from "../src/adapters/stdout-progress.ts";
import type { StdoutCapabilities } from "../src/domain/stdout-capabilities.ts";
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

/** Build capabilities with explicit fields; fun defaults off unless asked. */
function caps(partial: Partial<StdoutCapabilities>): StdoutCapabilities {
  return { colour: false, animate: false, fun: false, ...partial };
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
    const sink = new StdoutProgress(caps({}), rec.write);
    await sink.emit(started);
    expect(rec.output.endsWith("\n")).toBe(true);
    expect(rec.output).toContain("Wire the parser");
  });

  test("with colour off, no markdown asterisks leak into the output", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({}), rec.write);
    await sink.emit(started);
    expect(rec.output).not.toContain("**");
  });

  test("with colour on, the title is wrapped in ANSI bold", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ colour: true }), rec.write);
    await sink.emit(started);
    expect(rec.output).toContain("\x1b[1mWire the parser\x1b[0m");
  });

  test("when animation is off, heartbeats are suppressed (no spinner spam in a piped log)", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({}), rec.write);
    await sink.emit(heartbeat);
    expect(rec.output).toBe("");
  });

  test("when animation is off, output carries no carriage returns", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({}), rec.write);
    await sink.emit(started);
    await sink.emit(heartbeat);
    await sink.emit({ kind: "stage-done", stage: "stage-1", title: "Wire the parser" });
    expect(rec.output).not.toContain("\r");
  });

  test("when animation is on, a heartbeat redraws in place with a carriage return", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ animate: true }), rec.write);
    await sink.emit(heartbeat);
    expect(rec.output).toContain("\r");
  });

  test("when animation is on, a discrete event after a spinner breaks the line first", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ animate: true }), rec.write);
    await sink.emit(heartbeat); // opens a spinner line
    await sink.emit({ kind: "committed", stage: "stage-1", sha: "a1b2c3d4567" });
    // The chunk written for the discrete event must start by closing the spinner line.
    expect(rec.chunks.at(-1)!.startsWith("\n")).toBe(true);
  });

  test("on a TTY, a stage-started line carries a progress bar derived from index/total", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ animate: true }), rec.write);
    await sink.emit(started);
    expect(rec.output).toContain("1/3");
    expect(rec.output).toMatch(/[█░]/); // block glyphs present
  });

  test("on a non-TTY, the stage line keeps the plain N/total text with no block glyphs", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({}), rec.write);
    await sink.emit(started);
    expect(rec.output).toContain("1/3");
    expect(rec.output).not.toMatch(/[█░]/);
  });

  test("an animated heartbeat with a known activity shows that activity's glyph", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ animate: true }), rec.write);
    await sink.emit({
      kind: "heartbeat",
      stage: "stage-1",
      elapsedMs: 5000,
      activity: "editing run-step.ts",
    });
    expect(rec.output).toContain("✏️");
    expect(rec.output).toContain("editing run-step.ts");
  });

  test("the heartbeat does not carry the old double ⏳ marker (spinner is the only leading glyph)", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ animate: true }), rec.write);
    await sink.emit(heartbeat);
    expect(rec.output).not.toContain("⏳");
  });

  test("with colour on, a heartbeat well within budget colours the elapsed time green", async () => {
    const rec = recorder();
    // 5s elapsed against the default 20m ceiling → green.
    const sink = new StdoutProgress(caps({ colour: true, animate: true }), rec.write);
    await sink.emit(heartbeat);
    expect(rec.output).toContain("\x1b[32m"); // green
  });

  test("with colour on, a heartbeat near the timeout colours the elapsed time red", async () => {
    const rec = recorder();
    const ceiling = 20 * 60 * 1000;
    const sink = new StdoutProgress(caps({ colour: true, animate: true }), rec.write, ceiling);
    await sink.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 19 * 60 * 1000 });
    expect(rec.output).toContain("\x1b[31m"); // red
  });

  // --- personas (fun) ---------------------------------------------------------

  test("with fun on, a worker-running event shows the worker persona", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ fun: true }), rec.write);
    await sink.emit({ kind: "worker-running", stage: "stage-1" });
    expect(rec.output).toContain("🔨");
    expect(rec.output).toMatch(/hands on keyboard|wiring it up|making it real/);
  });

  test("with fun on, a verifier-running event stays skeptical (anti-sycophancy)", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ fun: true }), rec.write);
    await sink.emit({ kind: "verifier-running", stage: "stage-1" });
    expect(rec.output).toContain("🕵️");
    expect(rec.output).toMatch(/poking holes|calling its bluff|checking the work/);
  });

  test("with fun OFF, a worker-running event keeps the neutral wording", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({}), rec.write);
    await sink.emit({ kind: "worker-running", stage: "stage-1" });
    expect(rec.output).toContain("implementing");
    expect(rec.output).not.toContain("🔨");
  });

  test("with fun on, a passing verdict carries personality", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ fun: true }), rec.write);
    await sink.emit({ kind: "verdict", stage: "stage-1", verdict: "pass" });
    expect(rec.output).toMatch(/nailed it/);
  });

  test("with fun OFF, a verdict keeps the neutral VERDICT PASS wording", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({}), rec.write);
    await sink.emit({ kind: "verdict", stage: "stage-1", verdict: "pass" });
    expect(rec.output).toContain("VERDICT PASS");
    expect(rec.output).not.toMatch(/nailed it/);
  });

  test("with fun on, a heartbeat with NO activity shows rotating flavor text, not bare 'working'", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ animate: true, fun: true }), rec.write);
    await sink.emit({ kind: "heartbeat", stage: "stage-1", elapsedMs: 5000 });
    expect(rec.output).not.toMatch(/: working ·/);
  });

  test("with fun on, a known activity still takes precedence over flavor text", async () => {
    const rec = recorder();
    const sink = new StdoutProgress(caps({ animate: true, fun: true }), rec.write);
    await sink.emit({
      kind: "heartbeat",
      stage: "stage-1",
      elapsedMs: 5000,
      activity: "editing run-step.ts",
    });
    expect(rec.output).toContain("editing run-step.ts");
  });
});
