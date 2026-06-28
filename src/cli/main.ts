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
import type { RunStepDeps } from "../app/run-step.ts";

const VERSION = "0.1.0";

const HELP = `diablo ${VERSION} — a skill-driven Pi conductor

Usage:
  diablo run <issue>     Run an issue's stages through the agent pipeline
  diablo --version       Print the version
  diablo --help          Show this help
`;

function buildDeps(repoRoot: string): RunStepDeps {
  const runner = new BunProcessRunner();
  const piBinary = `${process.env.HOME}/.bun/bin/pi`;
  return {
    agent: new PiAgent(piBinary, runner),
    git: new GitCli(repoRoot, runner),
    gate: new StdinGate(),
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
      // The issue loader (read .scratch/<issue> into stages) is a separate
      // slice. Wiring is in place: buildDeps assembles the real adapters.
      void buildDeps(process.cwd());
      process.stderr.write(
        `run is not wired to the issue loader yet (issue: ${parsed.issue}).\n` +
          `The orchestration backbone and adapters exist; the loader is the next slice.\n`,
      );
      return 1;
    }
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
