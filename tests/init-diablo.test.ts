import { describe, expect, test } from "bun:test";
import {
  initDiablo,
  initDiabloNonInteractive,
  type InitDeps,
  type InitNonInteractiveOptions,
} from "../src/app/init-diablo.ts";
import { parseConfig } from "../src/domain/config.ts";
import { DEFAULT_TRIAGE_LABELS } from "../src/domain/init-templates.ts";
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
  ask(question: string): Promise<string> {
    this.asked.push(question);
    return Promise.resolve("");
  }
}

const CONFIG_PATH = "/proj/diablo.config.json";
const REPO_ROOT = "/proj";

function makeDeps(fs: FsPort, prompt: PromptPort, hasCommits = false) {
  const calls: string[] = [];
  const installed: PackageManager[] = [];
  const deps: InitDeps = {
    fs,
    prompt,
    hasCommits: async () => hasCommits,
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

const GITIGNORE_PATH = "/proj/.gitignore";

describe("initDiablo", () => {
  test("scaffolds a diablo.config.json with built-in defaults when none exists", async () => {
    const fs = new FakeFs();
    const { deps } = makeDeps(fs, new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

    expect(fs.files.has(CONFIG_PATH)).toBe(true);
    const parsed = parseConfig(fs.files.get(CONFIG_PATH)!);
    expect(parsed.gate).toBe("none");
    expect(parsed.integration.autoMerge).toBe(false);
  });

  test("does not overwrite an existing config file", async () => {
    const existing = '{ "gate": "none" }';
    const fs = new FakeFs({ [CONFIG_PATH]: existing });
    const { deps } = makeDeps(fs, new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

    expect(fs.files.get(CONFIG_PATH)).toBe(existing);
    expect(fs.writes).not.toContain(CONFIG_PATH);
  });

  test("invokes the setup-matt-pocock-skills flow", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });
    expect(calls).toContain("setup-skills");
  });

  test("asks (opt-in) whether to bootstrap tooling", async () => {
    const prompt = new FakePrompt(false);
    const { deps } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });
    expect(prompt.asked.join(" ")).toMatch(/husky|commitlint|bootstrap|git/i);
  });

  test("does nothing further when the user declines bootstrap", async () => {
    const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(false));
    await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });
    expect(calls).not.toContain("git-init");
    expect(calls).not.toContain("install-tooling");
  });

  test("after opting in, prompts to choose a package manager or skip", async () => {
    const prompt = new FakePrompt(true, "skip");
    const { deps } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

    expect(prompt.selectAsked).toHaveLength(1);
    expect(prompt.selectAsked[0]!.options).toEqual(["bun", "npm", "pnpm", "skip"]);
  });

  test("git init runs for a real package-manager choice, then installs tooling with it", async () => {
    const prompt = new FakePrompt(true, "pnpm");
    const { deps, calls, installed } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

    expect(calls).toContain("git-init");
    expect(calls).toContain("install-tooling");
    expect(installed).toEqual(["pnpm"]);
  });

  test("'skip' runs git init but installs NO tooling (non-Node escape hatch)", async () => {
    const prompt = new FakePrompt(true, "skip");
    const { deps, calls, installed } = makeDeps(new FakeFs(), prompt);
    await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

    expect(calls).toContain("git-init");
    expect(calls).not.toContain("install-tooling");
    expect(installed).toEqual([]);
  });

  test("git init runs independent of which package manager is chosen", async () => {
    for (const pm of ["bun", "npm", "pnpm", "skip"]) {
      const { deps, calls } = makeDeps(new FakeFs(), new FakePrompt(true, pm));
      await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });
      expect(calls).toContain("git-init");
    }
  });

  describe("gitignore scaffolding", () => {
    test("writes a .gitignore with diablo runtime dirs, even when bootstrap is declined", async () => {
      const fs = new FakeFs();
      const { deps } = makeDeps(fs, new FakePrompt(false));
      await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

      const content = fs.files.get(GITIGNORE_PATH);
      expect(content).toBeDefined();
      expect(content!).toContain(".diablo/");
      expect(content!).toContain(".worktrees/");
    });

    test("greenfield (no commits) seeds node_modules/dist/.env", async () => {
      const fs = new FakeFs();
      const { deps } = makeDeps(fs, new FakePrompt(false), false);
      await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

      const content = fs.files.get(GITIGNORE_PATH)!;
      expect(content).toContain("node_modules/");
      expect(content).toContain("dist/");
    });

    test("brownfield (has commits) does NOT seed node_modules/dist", async () => {
      const fs = new FakeFs();
      const { deps } = makeDeps(fs, new FakePrompt(false), true);
      await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

      const content = fs.files.get(GITIGNORE_PATH)!;
      expect(content).not.toContain("node_modules/");
      expect(content).toContain(".diablo/");
    });

    test("does not rewrite a .gitignore that already has the managed block (idempotent)", async () => {
      const fs = new FakeFs();
      const { deps } = makeDeps(fs, new FakePrompt(false));
      await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });
      const firstWriteCount = fs.writes.filter((p) => p === GITIGNORE_PATH).length;

      // Re-run init against the same fs — the block is present, so no rewrite.
      await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });
      const secondWriteCount = fs.writes.filter((p) => p === GITIGNORE_PATH).length;

      expect(firstWriteCount).toBe(1);
      expect(secondWriteCount).toBe(1);
    });

    test("preserves an existing .gitignore's content when adding the block", async () => {
      const fs = new FakeFs({ [GITIGNORE_PATH]: "secrets.key\n" });
      const { deps } = makeDeps(fs, new FakePrompt(false));
      await initDiablo(deps, { configPath: CONFIG_PATH, gitignorePath: GITIGNORE_PATH, repoRoot: REPO_ROOT });

      const content = fs.files.get(GITIGNORE_PATH)!;
      expect(content).toContain("secrets.key");
      expect(content).toContain(".diablo/");
    });
  });
});

// ── Non-interactive init ────────────────────────────────────────────────────

const NON_INTERACTIVE_DEFAULTS: InitNonInteractiveOptions = {
  agentDoc: "agents",
  context: "single",
  triageLabels: [],
};

function makeBaseDeps(fs: FsPort, hasCommits = false) {
  return { fs, hasCommits: async () => hasCommits };
}

const NI_CONFIG = {
  configPath: CONFIG_PATH,
  gitignorePath: GITIGNORE_PATH,
  repoRoot: REPO_ROOT,
};

describe("initDiabloNonInteractive", () => {
  test("scaffolds all default files", async () => {
    const fs = new FakeFs();
    await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, NON_INTERACTIVE_DEFAULTS);

    expect(fs.files.has(CONFIG_PATH)).toBe(true);
    expect(fs.files.has(GITIGNORE_PATH)).toBe(true);
    expect(fs.files.has(`${REPO_ROOT}/AGENTS.md`)).toBe(true);
    expect(fs.files.has(`${REPO_ROOT}/CONTEXT.md`)).toBe(true);
    expect(fs.files.has(`${REPO_ROOT}/.scratch/README.md`)).toBe(true);
    expect(fs.files.has(`${REPO_ROOT}/docs/agents/triage-labels.md`)).toBe(true);
    expect(fs.files.has(`${REPO_ROOT}/docs/agents/issue-tracker.md`)).toBe(true);
    expect(fs.files.has(`${REPO_ROOT}/docs/agents/domain.md`)).toBe(true);
  });

  test("does not overwrite existing files (idempotent)", async () => {
    const existing = "existing content";
    // Include the gitignore managed block so scaffoldGitignore is a no-op
    const gitignoreWithBlock =
      "existing\n# --- diablo (managed) ---\n.diablo/\n.worktrees/\n# --- end diablo (managed) ---\n";
    const fs = new FakeFs({
      [CONFIG_PATH]: existing,
      [GITIGNORE_PATH]: gitignoreWithBlock,
      [`${REPO_ROOT}/AGENTS.md`]: existing,
      [`${REPO_ROOT}/CONTEXT.md`]: existing,
      [`${REPO_ROOT}/.scratch/README.md`]: existing,
      [`${REPO_ROOT}/docs/agents/triage-labels.md`]: existing,
      [`${REPO_ROOT}/docs/agents/issue-tracker.md`]: existing,
      [`${REPO_ROOT}/docs/agents/domain.md`]: existing,
    });
    await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, NON_INTERACTIVE_DEFAULTS);

    // No files should have been written (all existed with correct content)
    expect(fs.writes).toHaveLength(0);
  });

  test("does not call prompt or setupSkills", async () => {
    const calls: string[] = [];
    const fs = new FakeFs();
    const deps = {
      fs,
      hasCommits: async () => false,
    };
    // If this tried to call prompt or setupSkills, it would fail because they
    // don't exist on BaseInitDeps. This test verifies the type constraint.
    await initDiabloNonInteractive(deps, NI_CONFIG, NON_INTERACTIVE_DEFAULTS);
    // No crash = no interactive calls attempted
  });

  test("config is valid JSON with expected defaults", async () => {
    const fs = new FakeFs();
    await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, NON_INTERACTIVE_DEFAULTS);

    const parsed = parseConfig(fs.files.get(CONFIG_PATH)!);
    expect(parsed.gate).toBe("none");
    expect(parsed.integration.autoMerge).toBe(false);
  });

  test("gitignore includes diablo runtime dirs", async () => {
    const fs = new FakeFs();
    await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, NON_INTERACTIVE_DEFAULTS);

    const content = fs.files.get(GITIGNORE_PATH)!;
    expect(content).toContain(".diablo/");
    expect(content).toContain(".worktrees/");
  });

  test("AGENTS.md references .scratch/ convention", async () => {
    const fs = new FakeFs();
    await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, NON_INTERACTIVE_DEFAULTS);

    const content = fs.files.get(`${REPO_ROOT}/AGENTS.md`)!;
    expect(content).toContain(".scratch/");
    expect(content).toContain("docs/agents/");
  });

  test("triage labels doc contains default labels", async () => {
    const fs = new FakeFs();
    await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, NON_INTERACTIVE_DEFAULTS);

    const content = fs.files.get(`${REPO_ROOT}/docs/agents/triage-labels.md`)!;
    for (const label of DEFAULT_TRIAGE_LABELS) {
      expect(content).toContain(label);
    }
  });

  describe("--claude flag", () => {
    test("scaffolds CLAUDE.md instead of AGENTS.md", async () => {
      const fs = new FakeFs();
      await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, {
        ...NON_INTERACTIVE_DEFAULTS,
        agentDoc: "claude",
      });

      expect(fs.files.has(`${REPO_ROOT}/CLAUDE.md`)).toBe(true);
      expect(fs.files.has(`${REPO_ROOT}/AGENTS.md`)).toBe(false);

      const content = fs.files.get(`${REPO_ROOT}/CLAUDE.md`)!;
      expect(content).toContain("Claude Code");
    });
  });

  describe("--context multiple", () => {
    test("domain.md references multiple contexts", async () => {
      const fs = new FakeFs();
      await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, {
        ...NON_INTERACTIVE_DEFAULTS,
        context: "multiple",
      });

      const content = fs.files.get(`${REPO_ROOT}/docs/agents/domain.md`)!;
      expect(content).toContain("multiple contexts");
      expect(content).toContain("docs/contexts/");
    });
  });

  describe("--triage-labels custom", () => {
    test("scaffolds triage doc with custom labels", async () => {
      const fs = new FakeFs();
      await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, {
        ...NON_INTERACTIVE_DEFAULTS,
        triageLabels: ["ready", "done", "blocked"],
      });

      const content = fs.files.get(`${REPO_ROOT}/docs/agents/triage-labels.md`)!;
      expect(content).toContain("`ready`");
      expect(content).toContain("`done`");
      expect(content).toContain("`blocked`");
      expect(content).not.toContain("`needs-triage`");
    });
  });

  describe("--no-triage-labels", () => {
    test("skips triage labels doc entirely", async () => {
      const fs = new FakeFs();
      await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, {
        ...NON_INTERACTIVE_DEFAULTS,
        triageLabels: null,
      });

      expect(fs.files.has(`${REPO_ROOT}/docs/agents/triage-labels.md`)).toBe(false);
      // Other docs still scaffolded
      expect(fs.files.has(`${REPO_ROOT}/docs/agents/issue-tracker.md`)).toBe(true);
      expect(fs.files.has(`${REPO_ROOT}/docs/agents/domain.md`)).toBe(true);
    });
  });

  describe("re-run is idempotent", () => {
    test("second run writes nothing new", async () => {
      const fs = new FakeFs();
      await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, NON_INTERACTIVE_DEFAULTS);
      const firstWrites = [...fs.writes];

      await initDiabloNonInteractive(makeBaseDeps(fs), NI_CONFIG, NON_INTERACTIVE_DEFAULTS);
      expect(fs.writes).toHaveLength(firstWrites.length);
    });
  });
});
