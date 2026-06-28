import { describe, expect, test } from "bun:test";
import { ProgressMdAdapter } from "../src/adapters/progress-md.ts";
import { FanOutProgress } from "../src/adapters/fan-out-progress.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { ProgressEvent, ProgressPort } from "../src/ports/progress.ts";

class FakeFs implements FsPort {
  files = new Map<string, string>();
  read(p: string): Promise<string> {
    const v = this.files.get(p);
    return v === undefined ? Promise.reject(new Error(`ENOENT ${p}`)) : Promise.resolve(v);
  }
  write(p: string, c: string): Promise<void> {
    this.files.set(p, c);
    return Promise.resolve();
  }
  exists(p: string): Promise<boolean> {
    return Promise.resolve(this.files.has(p));
  }
}

const NOTE_PATH = "/proj/.worktrees/roast-cli/.plans/roast-cli-progress.md";

describe("ProgressMdAdapter", () => {
  test("writes the live tracker to progress.md on each event", async () => {
    const fs = new FakeFs();
    const adapter = new ProgressMdAdapter(fs, NOTE_PATH, "roast-cli");
    await adapter.emit({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 2 });

    const md = fs.files.get(NOTE_PATH);
    expect(md).toBeDefined();
    expect(md!).toContain("Scaffold");
    expect(md!).toContain("roast-cli");
  });

  test("keeps updating the same file as the run progresses (live, not append)", async () => {
    const fs = new FakeFs();
    const adapter = new ProgressMdAdapter(fs, NOTE_PATH, "roast-cli");
    await adapter.emit({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 1 });
    await adapter.emit({ kind: "stage-done", stage: "stage-1", title: "Scaffold" });

    const md = fs.files.get(NOTE_PATH)!;
    expect(md).toMatch(/DONE/);
    // Only one progress.md, not one-per-event.
    expect([...fs.files.keys()]).toEqual([NOTE_PATH]);
  });

  test("exposes its tracker so a handoff note can be folded in", async () => {
    const fs = new FakeFs();
    const adapter = new ProgressMdAdapter(fs, NOTE_PATH, "roast-cli");
    await adapter.emit({ kind: "stage-started", stage: "stage-1", title: "Scaffold", index: 1, total: 1 });
    adapter.tracker.setHandoffNote("stage-1", "Deferred CI.");
    await adapter.emit({ kind: "stage-done", stage: "stage-1", title: "Scaffold" });
    expect(fs.files.get(NOTE_PATH)!).toContain("Deferred CI.");
  });
});

describe("FanOutProgress", () => {
  test("forwards every event to all sinks", async () => {
    const seenA: ProgressEvent[] = [];
    const seenB: ProgressEvent[] = [];
    const a: ProgressPort = { emit: (e) => { seenA.push(e); return Promise.resolve(); } };
    const b: ProgressPort = { emit: (e) => { seenB.push(e); return Promise.resolve(); } };
    const fan = new FanOutProgress([a, b]);

    await fan.emit({ kind: "done", commit: "abc" });

    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
  });

  test("one sink failing does not stop the others (progress is best-effort)", async () => {
    const seen: ProgressEvent[] = [];
    const bad: ProgressPort = { emit: () => Promise.reject(new Error("telegram down")) };
    const good: ProgressPort = { emit: (e) => { seen.push(e); return Promise.resolve(); } };
    const fan = new FanOutProgress([bad, good]);

    await fan.emit({ kind: "done" }); // must not throw
    expect(seen).toHaveLength(1);
  });
});
