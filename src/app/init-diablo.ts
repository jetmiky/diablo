/**
 * initDiablo scaffolds a project for diablo: it writes a default
 * diablo.config.json (without clobbering an existing one), runs the
 * setup-matt-pocock-skills flow, and OPT-IN asks whether to bootstrap project
 * tooling. Declining skips bootstrapping silently; this is the only
 * bootstrapping surface — `run` never auto-bootstraps.
 *
 * initDiabloNonInteractive is the flag-driven alternative: scaffolds everything
 * with sensible defaults, zero stdin, fully AFK-friendly. Controlled by the
 * InitFlags from args.ts.
 *
 * Bootstrap policy lives HERE (not in main.ts glue) so it is unit-tested:
 *   1. opt-in confirm — decline does nothing further;
 *   2. on accept, choose a package manager (bun/npm/pnpm) or "skip";
 *   3. `git init` runs for any real choice, independent of the manager;
 *   4. husky/commitlint are installed only for a real manager — "skip" is the
 *      escape hatch for non-Node projects (Go/Rust/Python), where these Node
 *      tools don't belong.
 *
 * The side-effecting steps (skill setup, git init, tooling install) are injected
 * as functions so this use-case is unit-tested against fakes; main.ts wires the
 * real implementations.
 */
import type { FsPort } from "../ports/fs.ts";
import type { PromptPort } from "../ports/prompt.ts";
import { defaultConfig } from "../domain/config.ts";
import { mergeGitignore } from "../domain/gitignore.ts";
import { PACKAGE_MANAGERS, type PackageManager } from "../domain/package-manager.ts";
import {
  buildAgentsMd,
  buildClaudeMd,
  buildContextMd,
  buildTriageLabelsMd,
  buildIssueTrackerMd,
  buildDomainMd,
} from "../domain/init-templates.ts";

/**
 * Minimal deps shared between interactive and non-interactive init. Only the
 * filesystem seam and the commit-check (for greenfield vs brownfield gitignore).
 */
export interface BaseInitDeps {
  fs: FsPort;
  /** True when the repo already has commits (brownfield). */
  hasCommits: () => Promise<boolean>;
}

export interface InitDeps extends BaseInitDeps {
  prompt: PromptPort;
  /** Runs the interactive setup-matt-pocock-skills flow (real: a Pi session). */
  setupSkills: () => Promise<void>;
  /** Initialises a git repo if the directory is not already one (idempotent). */
  gitInit: () => Promise<void>;
  /** Installs + initialises husky/commitlint using the chosen package manager. */
  installTooling: (pm: PackageManager) => Promise<void>;
}

export interface InitConfig {
  /** Absolute path where diablo.config.json should be scaffolded. */
  configPath: string;
  /** Absolute path where the project's .gitignore lives (created/merged). */
  gitignorePath: string;
  /** Absolute path to the project root (for .scratch/, docs/agents/, etc.). */
  repoRoot: string;
}

/** Options for the non-interactive init, derived from CLI flags. */
export interface InitNonInteractiveOptions {
  /** Which agent guidance doc to scaffold. */
  agentDoc: "agents" | "claude";
  /** Context layout mode. */
  context: "single" | "multiple";
  /**
   * Triage label scaffold policy.
   * - `[]` → scaffold with the default 5-label vocabulary
   * - `["a","b"]` → scaffold with custom labels
   * - `null` → skip triage scaffold entirely
   */
  triageLabels: string[] | null;
}

const BOOTSTRAP_QUESTION =
  "Bootstrap project tooling (git init if needed, husky, commitlint)?";

const PACKAGE_MANAGER_QUESTION =
  "Which package manager? ('skip' for non-Node projects: git init only, no husky/commitlint)";

/** The package-manager menu: the supported managers plus a "skip" escape hatch. */
const PACKAGE_MANAGER_OPTIONS = [...PACKAGE_MANAGERS, "skip"] as const;

// ── Interactive init (existing behaviour) ────────────────────────────────────

export async function initDiablo(deps: InitDeps, config: InitConfig): Promise<void> {
  await scaffoldConfig(deps.fs, config.configPath);
  await scaffoldGitignore(deps, config.gitignorePath);
  await deps.setupSkills();

  const wantsBootstrap = await deps.prompt.confirm(BOOTSTRAP_QUESTION);
  if (!wantsBootstrap) return;

  const choice = await deps.prompt.select(PACKAGE_MANAGER_QUESTION, PACKAGE_MANAGER_OPTIONS);

  // git init runs for any real bootstrap, independent of the manager choice.
  await deps.gitInit();

  // husky/commitlint are Node tools — only install them for a real package
  // manager. "skip" (or any unrecognised answer) leaves the project tool-free.
  if (isPackageManager(choice)) {
    await deps.installTooling(choice);
  }
}

// ── Non-interactive init (flag-driven) ───────────────────────────────────────

/**
 * Scaffolds a diablo project with sensible defaults, zero stdin. Every
 * scaffolded file is idempotent: if it already exists, it is skipped.
 *
 * This is the AFK-friendly alternative to the interactive `initDiablo`.
 */
export async function initDiabloNonInteractive(
  deps: BaseInitDeps,
  config: InitConfig,
  options: InitNonInteractiveOptions,
): Promise<void> {
  await scaffoldConfig(deps.fs, config.configPath);
  await scaffoldGitignore(deps, config.gitignorePath);

  // Agent guidance doc
  await scaffoldAgentDoc(deps.fs, config.repoRoot, options.agentDoc);

  // Context doc
  await scaffoldContextMd(deps.fs, config.repoRoot, options.context);

  // .scratch/ directory (via a README.md — write auto-creates parent dirs)
  await scaffoldScratchDir(deps.fs, config.repoRoot);

  // docs/agents/ convention files
  if (options.triageLabels !== null) {
    await scaffoldTriageLabels(deps.fs, config.repoRoot, options.triageLabels);
  }
  await scaffoldIssueTrackerMd(deps.fs, config.repoRoot);
  await scaffoldDomainMd(deps.fs, config.repoRoot, options.context);
}

// ── Internal scaffold functions ──────────────────────────────────────────────

function isPackageManager(value: string): value is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/**
 * Writes a default config, but only if one does not already exist — re-running
 * init must never clobber a config the user has since edited.
 *
 * The scaffolded JSON uses the canonical config key names (snake_case for
 * default_provider / default_model, camelCase for the rest) so it round-trips
 * through parseConfig without surprises.
 */
async function scaffoldConfig(fs: FsPort, configPath: string): Promise<void> {
  if (await fs.exists(configPath)) return;
  const d = defaultConfig();
  const scaffold = {
    defaults: {
      provider: d.defaultProvider,
      model: d.defaultModel,
      thinking: d.defaultThinking,
    },
    models: d.models,
    integration: d.integration,
    gate: d.gate,
    retry: d.retry,
    limits: d.limits,
    verify: d.verify,
  };
  const json = JSON.stringify(scaffold, null, 2) + "\n";
  await fs.write(configPath, json);
}

/**
 * Writes (or merges into) the project's .gitignore so diablo's machine-managed
 * runtime dirs (.diablo/, .worktrees/) are never committed. Done at EVERY init
 * — independent of the bootstrap choice — because those dirs are created by
 * `run` even in non-Node ("skip") projects and when bootstrap is declined.
 *
 * Greenfield (no commits) additionally seeds common ignores. The merge is
 * idempotent (mergeGitignore returns null when the managed block is already
 * present), so re-running init never rewrites the file.
 */
async function scaffoldGitignore(deps: BaseInitDeps, gitignorePath: string): Promise<void> {
  const existing = (await deps.fs.exists(gitignorePath)) ? await deps.fs.read(gitignorePath) : null;
  const greenfield = !(await deps.hasCommits());
  const merged = mergeGitignore(existing, greenfield);
  if (merged === null) return; // already present — idempotent no-op
  await deps.fs.write(gitignorePath, merged);
}

/** Writes AGENTS.md or CLAUDE.md depending on the agent doc choice. */
async function scaffoldAgentDoc(
  fs: FsPort,
  repoRoot: string,
  agentDoc: "agents" | "claude",
): Promise<void> {
  const filename = agentDoc === "claude" ? "CLAUDE.md" : "AGENTS.md";
  const path = `${repoRoot}/${filename}`;
  if (await fs.exists(path)) return;
  await fs.write(path, agentDoc === "claude" ? buildClaudeMd() : buildAgentsMd());
}

/** Writes a single-context or multi-context CONTEXT.md. */
async function scaffoldContextMd(
  fs: FsPort,
  repoRoot: string,
  _contextMode: "single" | "multiple",
): Promise<void> {
  const path = `${repoRoot}/CONTEXT.md`;
  if (await fs.exists(path)) return;
  await fs.write(path, buildContextMd());
}

/**
 * Creates .scratch/ by writing a small README.md inside it. NodeFs.write
 * auto-creates parent directories, so this is the simplest way to ensure the
 * directory exists without adding mkdir to FsPort.
 */
async function scaffoldScratchDir(fs: FsPort, repoRoot: string): Promise<void> {
  const readmePath = `${repoRoot}/.scratch/README.md`;
  if (await fs.exists(readmePath)) return;
  await fs.write(
    readmePath,
    `# .scratch/\n\nLocal issue tracker for diablo.\n` +
      `Each feature gets its own directory: \`.scratch/<feature-slug>/\`\n\n` +
      `See \`docs/agents/issue-tracker.md\` for the full convention.\n`,
  );
}

/** Writes docs/agents/triage-labels.md with the given labels. */
async function scaffoldTriageLabels(
  fs: FsPort,
  repoRoot: string,
  labels: string[],
): Promise<void> {
  const path = `${repoRoot}/docs/agents/triage-labels.md`;
  if (await fs.exists(path)) return;
  await fs.write(path, buildTriageLabelsMd(labels.length > 0 ? labels : undefined));
}

/** Writes docs/agents/issue-tracker.md. */
async function scaffoldIssueTrackerMd(fs: FsPort, repoRoot: string): Promise<void> {
  const path = `${repoRoot}/docs/agents/issue-tracker.md`;
  if (await fs.exists(path)) return;
  await fs.write(path, buildIssueTrackerMd());
}

/** Writes docs/agents/domain.md adapted to the context mode. */
async function scaffoldDomainMd(
  fs: FsPort,
  repoRoot: string,
  contextMode: "single" | "multiple",
): Promise<void> {
  const path = `${repoRoot}/docs/agents/domain.md`;
  if (await fs.exists(path)) return;
  await fs.write(path, buildDomainMd(contextMode));
}
