#!/usr/bin/env node
/**
 * Composition root for the diablo CLI. Wiring only — no business logic.
 * Parses argv, then dispatches. Real adapters (PiAgent + NodeProcessRunner,
 * GitCli, StdinGate) are assembled here and injected into the use-cases.
 */
import { parseArgs } from "./args.ts";
import { readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { resolveSkillsDir, skillFile } from "../domain/skills-path.ts";
import { PiAgent } from "../adapters/pi-agent.ts";
import { NodeProcessRunner } from "../adapters/node-process-runner.ts";
import { GitCli } from "../adapters/git-cli.ts";
import { StdinGate } from "../adapters/stdin-gate.ts";
import { NodeFs } from "../adapters/node-fs.ts";
import { runDiablo, type RunDiabloConfig, type RunDiabloDeps } from "../app/run-diablo.ts";
import { loadConfig } from "../app/load-config.ts";
import { initDiablo } from "../app/init-diablo.ts";
import { resolveModels, type ConfigModels } from "../domain/config.ts";
import { StdinPrompt } from "../adapters/stdin-prompt.ts";
import { GateDeclinedError } from "../ports/gate.ts";
import type { ModelOverrides } from "../domain/run-spec.ts";

const VERSION = "0.1.0";

const HELP = `diablo ${VERSION} — a skill-driven Pi conductor

Usage:
  diablo init            Scaffold diablo.config.json and set up skills
  diablo run <issue>     Run an issue's stages through the agent pipeline
  diablo --version       Print the version
  diablo --help          Show this help

Run options (override diablo.config.json, which overrides built-in defaults):
  --planner-model <m>    Override the planner model (e.g. claude-sonnet-4.5)
  --worker-model <m>     Override the worker model (e.g. claude-haiku-4.5)
  --verifier-model <m>   Override the verifier model (e.g. claude-opus-4.8)
`;

const CONFIG_FILENAME = "diablo.config.json";

/**
 * The vendored skills directory, resolved from THIS module's own location (not
 * the target project's cwd). `diablo run` executes inside an arbitrary project,
 * so the skills must be found relative to the diablo package — walking up from
 * the compiled module (dist/) or the source module (src/cli/) until `skills/`
 * is found. This is what makes a fresh clone / npm install self-contained.
 */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolveSkillsDir(MODULE_DIR, (p) => existsSync(p));

/**
 * Resolves a ticket location into concrete file paths for @-injection. Pi's
 * @file reads files, not directories (a directory crashes it with EISDIR), so
 * a directory is expanded to the .md files directly inside it.
 */
function resolveTicketPaths(location: string): string[] {
  let isDir = false;
  try {
    isDir = statSync(location).isDirectory();
  } catch {
    return [location]; // let the downstream read surface a clear ENOENT
  }
  if (!isDir) return [location];
  return readdirSync(location)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => `${location}/${name}`);
}

function buildDeps(repoRoot: string, overrides: ModelOverrides, runId: string): RunDiabloDeps {
  const runner = new NodeProcessRunner();
  const piBinary = `${process.env.HOME}/.bun/bin/pi`;
  return {
    agent: new PiAgent(piBinary, runner, overrides, runId),
    git: new GitCli(repoRoot, runner),
    fs: new NodeFs(),
    gate: new StdinGate(),
  };
}

/**
 * A unique id for this invocation, embedded in every step's Pi session-id. Pi
 * resumes an existing session-id, so without this a re-run would resume the
 * previous run's transcript and the agent would do nothing ("already done").
 * Timestamp-based so it is readable and sortable; the frozen plan on disk — not
 * the Pi session — remains the durable handoff, so a fresh runId on resume is
 * correct.
 */
function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/[TZ]/g, "");
}

/**
 * Builds per-tier model overrides from the RESOLVED model names (built-in <-
 * config <- CLI flag, computed by resolveModels). Only the model name is
 * swapped; each tier keeps its default thinking level (planner-high → high,
 * planner-med → medium, worker/verifier → medium), so pointing a tier at a
 * smaller model never loses the tier's thinking budget.
 */
function buildOverrides(models: ConfigModels): ModelOverrides {
  return {
    "planner-high": { model: models.planner, thinking: "high" },
    "planner-med": { model: models.planner, thinking: "medium" },
    worker: { model: models.worker, thinking: "medium" },
    verifier: { model: models.verifier, thinking: "medium" },
  };
}

function buildRunConfig(repoRoot: string, issue: string, skillsDir: string): RunDiabloConfig {
  const worktree = `${repoRoot}/.worktrees/${issue}`;
  return {
    issue,
    baseBranch: "main",
    worktree,
    ticketPaths: resolveTicketPaths(`${repoRoot}/.scratch/${issue}`),
    planPath: `${worktree}/.plans/${issue}-plan.md`,
    skills: {
      planner: [skillFile(skillsDir, "master-plan")],
      worker: [skillFile(skillsDir, "tdd")],
      verifier: [],
    },
  };
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  switch (parsed.command) {
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return 0;

    case "help":
      process.stdout.write(HELP);
      return 0;

    case "error":
      process.stderr.write(`error: ${parsed.message}\n\n${HELP}`);
      return 2;

    case "init": {
      const repoRoot = process.cwd();
      const configPath = `${repoRoot}/${CONFIG_FILENAME}`;
      const runner = new NodeProcessRunner();
      const piBinary = `${process.env.HOME}/.bun/bin/pi`;
      await initDiablo(
        {
          fs: new NodeFs(),
          prompt: new StdinPrompt(),
          setupSkills: () => runSetupSkills(piBinary, runner, repoRoot),
          bootstrap: () => bootstrapTooling(runner, repoRoot),
        },
        { configPath },
      );
      process.stdout.write(`\n✅ diablo initialized in ${repoRoot}\n`);
      return 0;
    }

    case "run": {
      const repoRoot = process.cwd();
      const config = await loadConfig({ fs: new NodeFs() }, `${repoRoot}/${CONFIG_FILENAME}`);
      const models = resolveModels(config, {
        plannerModel: parsed.plannerModel,
        workerModel: parsed.workerModel,
        verifierModel: parsed.verifierModel,
      });
      const overrides = buildOverrides(models);
      const skillsDir = config.skillsDir ?? SKILLS_DIR;
      const runId = newRunId();
      const deps = buildDeps(repoRoot, overrides, runId);
      const runConfig = buildRunConfig(repoRoot, parsed.issue, skillsDir);
      try {
        const result = await runDiablo(deps, runConfig);
        process.stdout.write(
          `\n✅ issue ${parsed.issue} complete` +
            (result.commit ? ` — final commit ${result.commit.slice(0, 10)}` : "") +
            `\n`,
        );
        return 0;
      } catch (err) {
        if (err instanceof GateDeclinedError) {
          process.stdout.write(`\n⏸  ${err.message}\n`);
          return 0; // a clean human halt, not a failure
        }
        throw err;
      }
    }
  }
}

/**
 * Runs the interactive setup-matt-pocock-skills flow. This is the ONE place
 * interactivity is appropriate (Socratic setup), so it runs an INTERACTIVE Pi
 * session (inherited stdio), not a headless `-p` run. The vendored skill is
 * injected as an @file reference.
 */
async function runSetupSkills(
  piBinary: string,
  runner: NodeProcessRunner,
  repoRoot: string,
): Promise<void> {
  process.stdout.write("\nSetting up engineering skills (interactive)...\n");
  const skill = skillFile(SKILLS_DIR, "setup-matt-pocock-skills");
  await runner.run(
    piBinary,
    [`@${skill}`, "Set up the engineering skills for this project following the skill."],
    repoRoot,
  );
}

/**
 * Bootstraps Node-based dev tooling: git init (if not already a repo), husky,
 * and commitlint. Best-effort and idempotent; invoked only when the user
 * opted in during init. Errors surface to the caller so a failed bootstrap is
 * visible rather than silently swallowed.
 */
async function bootstrapTooling(runner: NodeProcessRunner, repoRoot: string): Promise<void> {
  process.stdout.write("\nBootstrapping git/husky/commitlint...\n");
  const isRepo = existsSync(`${repoRoot}/.git`);
  if (!isRepo) {
    await runner.run("git", ["init"], repoRoot);
  }
  await runner.run(
    "npm",
    ["install", "--save-dev", "husky", "@commitlint/cli", "@commitlint/config-conventional"],
    repoRoot,
  );
  await runner.run("npx", ["husky", "init"], repoRoot);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
