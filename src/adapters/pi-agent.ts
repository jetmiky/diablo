/**
 * PiAgent is the real AgentPort: it turns a RunSpec into pi argv, spawns the
 * pi binary in the step's worktree via an injected ProcessRunner, and parses
 * the JSONL stdout into a structured result.
 *
 * The ProcessRunner seam keeps this logic unit-testable with a fake; the live
 * binding (BunProcessRunner) is exercised by the smoke test, not unit tests.
 */
import type { AgentPort, ProcessRunner } from "../ports/agent.ts";
import { buildPiArgs, type ModelOverrides, type RunSpec } from "../domain/run-spec.ts";
import { parsePiResult, type PiResult } from "../domain/pi-result.ts";

export class PiAgent implements AgentPort {
  constructor(
    private readonly piBinary: string,
    private readonly runner: ProcessRunner,
    private readonly overrides: ModelOverrides = {},
  ) {}

  async run(spec: RunSpec): Promise<PiResult> {
    const args = buildPiArgs(spec, this.overrides);
    const outcome = await this.runner.run(this.piBinary, args, spec.worktree);

    if (outcome.exitCode !== 0) {
      throw new Error(
        `Pi exited with code ${outcome.exitCode} for ${spec.tier} step ` +
          `(${spec.issue}/${spec.stage}).\n${outcome.stderr.trim()}`,
      );
    }

    return parsePiResult(outcome.stdout);
  }
}
