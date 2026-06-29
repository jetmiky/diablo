import { describe, expect, test } from "bun:test";
import { initDiablo, type InitDeps } from "../src/app/init-diablo.ts";
import { parseConfig } from "../src/domain/config.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PromptPort } from "../src/ports/prompt.ts";
import type { PackageManager } from "../src/domain/package-manager.ts";

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

/**
 * A scripted prompt: `confirm` returns a canned boolean; `select` returns a
 * canned choice. Both record what they were asked so tests can assert on the
 * prompt copy.
 */
class FakePrompt implements PromptPort {
  asked: string[] = [];
  selectAsked: { question: string; options: readonly string[] }[] = [];
  constructor(
    private readonly answer: boolean,
    private readonly choice: string = "skip",
  ) {}
  confirm(question: string): Promise<boolean> {
    this.asked.push(question);
    return Promise.resolve(this.answer);
  }
  select(question: string, options: readonly string[]): Promise<string> {
    this.selectAsked.push({ question, options });
    return Promise.resolve(this.choice);
  }
}

const CONFIG_PATH = "/proj/diablo.config.json";

function makeDeps(fs: FsPort, prompt: PromptPort) {
  const calls: string[] = [];
  const installed: PackageManager[] = [];
  const deps: InitDeps = {
    fs,
    prompt,
    setupSkills: async () => {
      calls.push("setup-skills");
    },
    gitInit: async () => {
      calls.push("git-init");
    },
    installTooling: async (pm: PackageManager) => {
      calls.push("install-tooling");
      installed.push(pm);
    },
  };
  return { deps, calls, installed };
}

describe("initDiablo", () => {
  test("scaffolds a diablo.config.json with built-in defaults when none exists", async () => {
    const fs = new FakeFs();
    const { deps } = makeDeps(fs, new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH });

    expect(fs.files.has(CONFIG_PATH)).toBe(true);
    const parsed = parseConfig(fs.files.get(CONFIG_PATH)!);
    expect(parsed.gate).toBe("approval");
    expect(parsed.integration.autoMerge).toBe(false);
  });

  test("does not overwrite an existing config file", async () => {
    const existing = '{ "gate": "none" }';
    const fs = new FakeFs({ [CONFIG_PATH]: existing });
    const { deps } = makeDeps(fs, new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH });

    expect(fs.files.get(CONFIG_PATH)).toBe(existing);
    expect(fs.writes).not.toContain(CONFIG_PATH);
  });

  test("invokes the setup-matt-pocock-skills flow", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH });
    expect(calls).toContain("setup-skills");
  });

  test("asks (opt-in) whether to bootstrap tooling", async () => {
    const prompt = new FakePrompt(false);
    const { deps } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH });
    expect(prompt.asked.join(" ")).toMatch(/husky|commitlint|bootstrap|git/i);
  });

  test("does nothing further when the user declines bootstrap", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH });
    expect(calls).not.toContain("git-init");
    expect(calls).not.toContain("install-tooling");
  });

  test("after opting in, prompts to choose a package manager or skip", async () => {
    const prompt = new FakePrompt(true, "skip");
    const { deps } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH });

    expect(prompt.selectAsked).toHaveLength(1);
    expect(prompt.selectAsked[0]!.options).toEqual(["bun", "npm", "pnpm", "skip"]);
  });

  test("git init runs for a real package-manager choice, then installs tooling with it", async () => {
    const prompt = new FakePrompt(true, "pnpm");
    const { deps, calls, installed } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH });

    expect(calls).toContain("git-init");
    expect(calls).toContain("install-tooling");
    expect(installed).toEqual(["pnpm"]);
  });

  test("'skip' runs git init but installs NO tooling (non-Node escape hatch)", async () => {
    const prompt = new FakePrompt(true, "skip");
    const { deps, calls, installed } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH });

    expect(calls).toContain("git-init");
    expect(calls).not.toContain("install-tooling");
    expect(installed).toEqual([]);
  });

  test("git init runs independent of which package manager is chosen", async () => {
    for (const pm of ["bun", "npm", "pnpm", "skip"]) {
      const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(true, pm));
      await initDiablo(deps, { configPath: CONFIG_PATH });
      expect(calls).toContain("git-init");
    }
  });
});
