#!/usr/bin/env node
/**
 * Composition root for the diablo CLI. Wiring only — no business logic.
 * Parses argv, then dispatches. Real adapters (PiAgent + BunProcessRunner,
 * GitCli, StdinGate) are assembled here and injected into the use-cases.
 */
import { parseArgs } from "./args.ts";
import { PiAgent } from "../adapters/pi-agent.ts";
import { BunProcessRunner } from "../adapters/bun-process-runner.ts";
import { GitCli } from "../adapters/git-cli.ts";
import { StdinGate } from "../adapters/stdin-gate.ts";
import { NodeFs } from "../adapters/node-fs.ts";
import { runDiablo, type RunDiabloConfig, type RunDiabloDeps } from "../app/run-diablo.ts";
import { GateDeclinedError } from "../ports/gate.ts";

const VERSION = "0.1.0";

const HELP = `diablo ${VERSION} — a skill-driven Pi conductor

Usage:
  diablo run <issue>     Run an issue's stages through the agent pipeline
  diablo --version       Print the version
  diablo --help          Show this help
`;

const SKILLS_DIR = `${process.env.HOME}/.agents/skills`;

function buildDeps(repoRoot: string): RunDiabloDeps {
  const runner = new BunProcessRunner();
  const piBinary = `${process.env.HOME}/.bun/bin/pi`;
  return {
    agent: new PiAgent(piBinary, runner),
    git: new GitCli(repoRoot, runner),
    fs: new NodeFs(),
    gate: new StdinGate(),
  };
}

function buildRunConfig(repoRoot: string, issue: string): RunDiabloConfig {
  const worktree = `${repoRoot}/.worktrees/${issue}`;
  return {
    issue,
    baseBranch: "main",
    worktree,
    ticketPaths: [`${repoRoot}/.scratch/${issue}`],
    planPath: `${worktree}/.plans/${issue}-plan.md`,
    skills: {
      planner: [`${SKILLS_DIR}/master-plan/SKILL.md`],
      worker: [`${SKILLS_DIR}/tdd/SKILL.md`],
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

    case "run": {
      const deps = buildDeps(process.cwd());
      const config = buildRunConfig(process.cwd(), parsed.issue);
      try {
        const result = await runDiablo(deps, config);
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

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
