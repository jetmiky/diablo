/**
 * initDiablo scaffolds a project for diablo: it writes a default
 * diablo.config.json (without clobbering an existing one), runs the
 * setup-matt-pocock-skills flow, and OPT-IN asks whether to bootstrap project
 * tooling. Declining skips bootstrapping silently; this is the only
 * bootstrapping surface — `run` never auto-bootstraps.
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

export interface InitDeps {
  fs: FsPort;
  prompt: PromptPort;
  /**
   * True when the repo already has commits. A fresh project (no commits, or not
   * a git repo yet) is "greenfield" — diablo seeds common ignores there; an
   * established repo owns its own conventions, so diablo contributes only its
   * runtime dirs.
   */
  hasCommits: () => Promise<boolean>;
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
}

const BOOTSTRAP_QUESTION =
  "Bootstrap project tooling (git init if needed, husky, commitlint)?";

const PACKAGE_MANAGER_QUESTION =
  "Which package manager? ('skip' for non-Node projects: git init only, no husky/commitlint)";

/** The package-manager menu: the supported managers plus a "skip" escape hatch. */
const PACKAGE_MANAGER_OPTIONS = [...PACKAGE_MANAGERS, "skip"] as const;

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

function isPackageManager(value: string): value is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/**
 * Writes a default config, but only if one does not already exist — re-running
 * init must never clobber a config the user has since edited.
 */
async function scaffoldConfig(fs: FsPort, configPath: string): Promise<void> {
  if (await fs.exists(configPath)) return;
  const json = JSON.stringify(defaultConfig(), null, 2) + "\n";
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
async function scaffoldGitignore(deps: InitDeps, gitignorePath: string): Promise<void> {
  const existing = (await deps.fs.exists(gitignorePath)) ? await deps.fs.read(gitignorePath) : null;
  const greenfield = !(await deps.hasCommits());
  const merged = mergeGitignore(existing, greenfield);
  if (merged === null) return; // already present — idempotent no-op
  await deps.fs.write(gitignorePath, merged);
}
