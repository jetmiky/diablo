import { describe, expect, test } from "bun:test";
import { initDiablo, type InitDeps } from "../src/app/init-diablo.ts";
import { parseConfig } from "../src/domain/config.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PromptPort } from "../src/ports/prompt.ts";

class FakeFs implements FsPort {
  files = new Map<string, string>();
  writes: string[] = [];
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }
  read(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
    return Promise.resolve(v);
  }
  write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    this.writes.push(path);
    return Promise.resolve();
  }
  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
}

class FakePrompt implements PromptPort {
  constructor(private answer: boolean) {}
  asked: string[] = [];
  confirm(question: string): Promise<boolean> {
    this.asked.push(question);
    return Promise.resolve(this.answer);
  }
}

const CONFIG_PATH = "/proj/diablo.config.json";

function makeDeps(fs: FsPort, prompt: PromptPort) {
  const calls: string[] = [];
  const deps: InitDeps = {
    fs,
    prompt,
    setupSkills: async () => {
      calls.push("setup-skills");
    },
    bootstrap: async () => {
      calls.push("bootstrap");
    },
  };
  return { deps, calls };
}

describe("initDiablo", () => {
  test("scaffolds a diablo.config.json with built-in defaults when none exists", async () => {
    const fs = new FakeFs();
    const { deps } = makeDeps(fs, new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH });

    expect(fs.files.has(CONFIG_PATH)).toBe(true);
    // The scaffold must be valid config that parses back to defaults.
    const parsed = parseConfig(fs.files.get(CONFIG_PATH)!);
    expect(parsed.gate).toBe("approval");
    expect(parsed.integration.autoMerge).toBe(false);
  });

  test("does not overwrite an existing config file", async () => {
    const existing = '{ "gate": "none" }';
    const fs = new FakeFs({ [CONFIG_PATH]: existing });
    const { deps } = makeDeps(fs, new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH });

    expect(fs.files.get(CONFIG_PATH)).toBe(existing); // untouched
    expect(fs.writes).not.toContain(CONFIG_PATH);
  });

  test("invokes the setup-matt-pocock-skills flow", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH });
    expect(calls).toContain("setup-skills");
  });

  test("asks (opt-in) whether to bootstrap git/husky/commitlint", async () => {
    const prompt = new FakePrompt(false);
    const { deps } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH });
    expect(prompt.asked.join(" ")).toMatch(/husky|commitlint|bootstrap|git/i);
  });

  test("bootstraps tooling when the user accepts", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(true));
    await initDiablo(deps, { configPath: CONFIG_PATH });
    expect(calls).toContain("bootstrap");
  });

  test("skips bootstrapping silently when the user declines", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH });
    expect(calls).not.toContain("bootstrap");
  });
});
