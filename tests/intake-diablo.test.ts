import { describe, expect, test } from "bun:test";
import { intakeDiablo, type IntakeDeps, type GrillContext } from "../src/app/intake-diablo.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PromptPort } from "../src/ports/prompt.ts";

class FakeFs implements FsPort {
  files = new Map<string, string>();
  dirs = new Set<string>();
  constructor(initial: Record<string, string> = {}, dirs: string[] = []) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
    for (const d of dirs) this.dirs.add(d);
  }
  read(p: string): Promise<string> {
    const v = this.files.get(p);
    return v === undefined ? Promise.reject(new Error(`ENOENT ${p}`)) : Promise.resolve(v);
  }
  write(p: string, c: string): Promise<void> {
    this.files.set(p, c);
    return Promise.resolve();
  }
  exists(p: string): Promise<boolean> {
    return Promise.resolve(this.files.has(p) || this.dirs.has(p));
  }
}

/**
 * Distinguishes the two yes/no questions intake asks: the optional
 * state-machine modeling step (defaults to skip) and the PRD approval. `select`
 * returns the first option (unused by intake today).
 */
class FakePrompt implements PromptPort {
  asked: string[] = [];
  constructor(
    private readonly prdApproval: boolean,
    private readonly wantsStateMachine: boolean = false,
  ) {}
  confirm(q: string): Promise<boolean> {
    this.asked.push(q);
    if (/state.?machine/i.test(q)) return Promise.resolve(this.wantsStateMachine);
    return Promise.resolve(this.prdApproval);
  }
  select(_q: string, options: readonly string[]): Promise<string> {
    return Promise.resolve(options[0]!);
  }
}

function makeDeps(fs: FsPort, prompt: PromptPort) {
  const calls: string[] = [];
  const seen: { toPrd?: GrillContext } = {};
  const deps: IntakeDeps = {
    fs,
    prompt,
    grill: async () => { calls.push("grill"); },
    modelStateMachine: async (ctx) => {
      calls.push("model-state-machine");
      // The real step authors the artifact; the fake records that it would.
      if (ctx.stateMachinePath) await fs.write(ctx.stateMachinePath, "# State machine\n");
    },
    toPrd: async (ctx) => { calls.push("to-prd"); seen.toPrd = ctx; },
    toIssues: async () => { calls.push("to-issues"); },
  };
  return { deps, calls, seen };
}

const FEATURE = "billing";
const config = {
  feature: FEATURE,
  repoRoot: "/proj",
  scratchDir: "/proj/.scratch/billing",
};

describe("intakeDiablo", () => {
  test("runs the interactive grill step", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(true));
    await intakeDiablo(deps, config);
    expect(calls[0]).toBe("grill");
  });

  test("chains to to-prd then to-issues when the PRD is approved", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(true));
    await intakeDiablo(deps, config);
    expect(calls).toEqual(["grill", "to-prd", "to-issues"]);
  });

  test("asks for human approval of the PRD before decomposition", async () => {
    const prompt = new FakePrompt(true);
    const { deps } = makeDeps(new FakeFs(), prompt);
    await intakeDiablo(deps, config);
    expect(prompt.asked.join(" ").toLowerCase()).toMatch(/prd|approve|decompose/);
  });

  test("stops after to-prd if the human does not approve (no to-issues)", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(false));
    await intakeDiablo(deps, config);
    expect(calls).toEqual(["grill", "to-prd"]);
    expect(calls).not.toContain("to-issues");
  });

  test("returns the scratch dir where resulting issues land", async () => {
    const { deps } = makeDeps(new FakeFs(), new FakePrompt(true));
    const result = await intakeDiablo(deps, config);
    expect(result.scratchDir).toBe("/proj/.scratch/billing");
  });

  test("adapts exploration to brownfield when CONTEXT.md exists", async () => {
    const fs = new FakeFs({ "/proj/CONTEXT.md": "# Domain" });
    let mode: string | undefined;
    const { deps } = makeDeps(fs, new FakePrompt(true));
    deps.grill = async (ctx) => { mode = ctx.mode; };
    await intakeDiablo(deps, config);
    expect(mode).toBe("brownfield");
  });

  test("adapts exploration to greenfield when no CONTEXT.md exists", async () => {
    let mode: string | undefined;
    const { deps } = makeDeps(new FakeFs(), new FakePrompt(true));
    deps.grill = async (ctx) => { mode = ctx.mode; };
    await intakeDiablo(deps, config);
    expect(mode).toBe("greenfield");
  });

  // --- state-machine modeling step (issue 03) ---

  test("offers the state-machine step after grill and before to-prd", async () => {
    const prompt = new FakePrompt(true);
    const { deps } = makeDeps(new FakeFs(), prompt);
    await intakeDiablo(deps, config);
    expect(prompt.asked.join(" ").toLowerCase()).toMatch(/state.?machine/);
  });

  test("runs the state-machine step between grill and to-prd when accepted", async () => {
    const prompt = new FakePrompt(true, true); // approve PRD + want state machine
    const { deps, calls } = makeDeps(new FakeFs(), prompt);
    await intakeDiablo(deps, config);
    expect(calls).toEqual(["grill", "model-state-machine", "to-prd", "to-issues"]);
  });

  test("skips the state-machine step cleanly when declined — no artifact, no call", async () => {
    const fs = new FakeFs();
    const prompt = new FakePrompt(true, false); // approve PRD, skip state machine
    const { deps, calls } = makeDeps(fs, prompt);
    await intakeDiablo(deps, config);
    expect(calls).not.toContain("model-state-machine");
    expect(fs.files.has("/proj/.scratch/billing/state-machine.md")).toBe(false);
  });

  test("when run, writes a state-machine artifact that to-prd receives as input", async () => {
    const fs = new FakeFs();
    const prompt = new FakePrompt(true, true);
    const { deps, seen } = makeDeps(fs, prompt);
    await intakeDiablo(deps, config);

    // to-prd's context carries the artifact path so the PRD can incorporate it.
    expect(seen.toPrd?.stateMachinePath).toBe("/proj/.scratch/billing/state-machine.md");
    expect(fs.files.has("/proj/.scratch/billing/state-machine.md")).toBe(true);
  });

  test("when skipped, to-prd receives no state-machine path", async () => {
    const prompt = new FakePrompt(true, false);
    const { deps, seen } = makeDeps(new FakeFs(), prompt);
    await intakeDiablo(deps, config);
    expect(seen.toPrd?.stateMachinePath).toBeUndefined();
  });
});
