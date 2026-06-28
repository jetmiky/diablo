/**
 * initDiablo scaffolds a project for diablo: it writes a default
 * diablo.config.json (without clobbering an existing one), runs the
 * setup-matt-pocock-skills flow, and OPT-IN asks whether to bootstrap project
 * tooling (git/husky/commitlint). Declining skips bootstrapping silently; this
 * is the only bootstrapping surface — `run` never auto-bootstraps.
 *
 * The side-effecting steps (skill setup, tooling bootstrap) are injected as
 * functions so this use-case is unit-tested against fakes; main.ts wires the
 * real implementations (interactive Pi session + a tooling bootstrapper).
 */
import type { FsPort } from "../ports/fs.ts";
import type { PromptPort } from "../ports/prompt.ts";
import { defaultConfig } from "../domain/config.ts";

export interface InitDeps {
  fs: FsPort;
  prompt: PromptPort;
  /** Runs the interactive setup-matt-pocock-skills flow (real: a Pi session). */
  setupSkills: () => Promise<void>;
  /** Bootstraps git/husky/commitlint when the user opts in. */
  bootstrap: () => Promise<void>;
}

export interface InitConfig {
  /** Absolute path where diablo.config.json should be scaffolded. */
  configPath: string;
}

const BOOTSTRAP_QUESTION =
  "Bootstrap project tooling (git init if needed, husky, commitlint)?";

export async function initDiablo(deps: InitDeps, config: InitConfig): Promise<void> {
  await scaffoldConfig(deps.fs, config.configPath);
  await deps.setupSkills();

  const wantsBootstrap = await deps.prompt.confirm(BOOTSTRAP_QUESTION);
  if (wantsBootstrap) {
    await deps.bootstrap();
  }
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
