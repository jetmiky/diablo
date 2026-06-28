import { describe, expect, test } from "bun:test";
import { ProgressTracker } from "../src/domain/progress-tracker.ts";

/**
 * The progress tracker is a pure state machine: it folds progress events into a
 * live markdown document with per-stage status, results, a Pending Todos list,
 * and folded-in handoff notes. No I/O — the fs adapter persists render() output.
 */
describe("ProgressTracker", () => {
  test("renders a stage as IN_PROGRESS once started, DONE once finished", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 2 });
    expect(t.render()).toMatch(/Scaffold.*IN_PROGRESS|IN_PROGRESS.*Scaffold/);

    t.apply({ kind: "stage-done", stage: "stage-1", title: "Scaffold" });
    expect(t.render()).toMatch(/Scaffold.*DONE|DONE.*Scaffold/);
  });

  test("records a stage's commit sha and verdict in its result", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 2 });
    t.apply({ kind: "committed", stage: "stage-1", sha: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4" });
    t.apply({ kind: "verdict", stage: "stage-1", verdict: "pass" });
    const md = t.render();
    expect(md).toContain("a1b2c3d"); // short sha
    expect(md.toLowerCase()).toMatch(/pass/);
  });

  test("a stage not yet started renders as TODO", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 3 });
    // stage 2 and 3 known via total but not started → represented as pending todos
    const md = t.render();
    expect(md).toMatch(/Pending Todos/i);
  });

  test("folds a per-stage handoff note into the tracker", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 2 });
    t.setHandoffNote("stage-1", "Chose bun:test over vitest; deferred CI wiring.");
    expect(t.render()).toContain("Chose bun:test over vitest");
  });

  test("the latest handoff note is retrievable for the next stage's design input", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 2 });
    t.setHandoffNote("stage-1", "Deferred CI wiring.");
    expect(t.handoffNote("stage-1")).toBe("Deferred CI wiring.");
    expect(t.handoffNote("stage-2")).toBeUndefined();
  });

  test("marks the run done with the final commit", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 1 });
    t.apply({ kind: "stage-done", stage: "stage-1", title: "Scaffold" });
    t.apply({ kind: "done", commit: "f".repeat(40) });
    const md = t.render();
    expect(md.toLowerCase()).toMatch(/complete|done/);
    expect(md).toContain("f".repeat(7));
  });

  test("records a halt with its reason", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 2 });
    t.apply({ kind: "halted", reason: "verifier FAIL [plan] in stage-1" });
    const md = t.render();
    expect(md.toLowerCase()).toMatch(/halt/);
    expect(md).toContain("verifier FAIL [plan]");
  });

  test("the title names the issue", () => {
    const t = new ProgressTracker("roast-cli");
    expect(t.render()).toContain("roast-cli");
  });

  test("a retry is reflected in the stage result", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 1 });
    t.apply({ kind: "retry", stage: "stage-1", attempt: 1 });
    expect(t.render().toLowerCase()).toMatch(/retry|attempt/);
  });

  test("a handoff event folds its note into the tracker", () => {
    const t = new ProgressTracker("roast-cli");
    t.apply({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 1 });
    t.apply({ kind: "handoff", stage: "stage-1", note: "Used bun:test; deferred CI." });
    expect(t.render()).toContain("Used bun:test; deferred CI.");
    expect(t.handoffNote("stage-1")).toBe("Used bun:test; deferred CI.");
  });
});
