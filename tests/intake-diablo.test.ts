import { describe, expect, test } from "bun:test";
import { intakeDiablo, type IntakeDeps } from "../src/app/intake-diablo.ts";
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

class FakePrompt implements PromptPort {
  asked: string[] = [];
  constructor(private answer: boolean) {}
  confirm(q: string): Promise<boolean> {
    this.asked.push(q);
    return Promise.resolve(this.answer);
  }
  select(_q: string, options: readonly string[]): Promise<string> {
    return Promise.resolve(options[0]!);
  }
}

function makeDeps(fs: FsPort, prompt: PromptPort, approve: boolean) {
  const calls: string[] = [];
  const deps: IntakeDeps = {
    fs,
    prompt,
    grill: async () => { calls.push("grill"); },
    toPrd: async () => { calls.push("to-prd"); },
    toIssues: async () => { calls.push("to-issues"); },
  };
  return { deps, calls };
}

const FEATURE = "billing";
const config = {
  feature: FEATURE,
  repoRoot: "/proj",
  scratchDir: "/proj/.scratch/billing",
};

describe("intakeDiablo", () => {
  test("runs the interactive grill step", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(true), true);
    await intakeDiablo(deps, config);
    expect(calls[0]).toBe("grill");
  });

  test("chains to to-prd then to-issues when the PRD is approved", async () => {
    const prompt = new FakePrompt(true); // approve the PRD
    const { deps, calls } = makeDeps(new FakeFs(), prompt, true);
    await intakeDiablo(deps, config);
    expect(calls).toEqual(["grill", "to-prd", "to-issues"]);
  });

  test("asks for human approval of the PRD before decomposition", async () => {
    const prompt = new FakePrompt(true);
    const { deps } = makeDeps(new FakeFs(), prompt, true);
    await intakeDiablo(deps, config);
    expect(prompt.asked.join(" ").toLowerCase()).toMatch(/prd|approve|decompose/);
  });

  test("stops after to-prd if the human does not approve (no to-issues)", async () => {
    const prompt = new FakePrompt(false); // decline the PRD
    const { deps, calls } = makeDeps(new FakeFs(), prompt, false);
    await intakeDiablo(deps, config);
    expect(calls).toEqual(["grill", "to-prd"]);
    expect(calls).not.toContain("to-issues");
  });

  test("returns the scratch dir where resulting issues land", async () => {
    const { deps } = makeDeps(new FakeFs(), new FakePrompt(true), true);
    const result = await intakeDiablo(deps, config);
    expect(result.scratchDir).toBe("/proj/.scratch/billing");
  });

  test("adapts exploration to brownfield when CONTEXT.md exists", async () => {
    const fs = new FakeFs({ "/proj/CONTEXT.md": "# Domain" });
    let mode: string | undefined;
    const deps: IntakeDeps = {
      fs,
      prompt: new FakePrompt(true),
      grill: async (ctx) => { mode = ctx.mode; },
      toPrd: async () => {},
      toIssues: async () => {},
    };
    await intakeDiablo(deps, config);
    expect(mode).toBe("brownfield");
  });

  test("adapts exploration to greenfield when no CONTEXT.md exists", async () => {
    let mode: string | undefined;
    const deps: IntakeDeps = {
      fs: new FakeFs(),
      prompt: new FakePrompt(true),
      grill: async (ctx) => { mode = ctx.mode; },
      toPrd: async () => {},
      toIssues: async () => {},
    };
    await intakeDiablo(deps, config);
    expect(mode).toBe("greenfield");
  });
});
