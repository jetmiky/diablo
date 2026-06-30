/**
 * CommandVerifyGate is the real VerifyGate (ADR 0001): it runs the project's
 * configured deterministic gate commands (e.g. "bun run typecheck", "bun test")
 * in the issue's worktree via the injected ProcessRunner, and returns each
 * command's exit code. run-step fuses these MEASURED exit codes with the
 * verifier LLM's verdict — a non-zero exit fails the stage regardless of what
 * the LLM claimed.
 *
 * All commands are run (no short-circuit) so the worker-retry feedback can
 * report every failing gate, not just the first. Each command string is split
 * into argv on whitespace — sufficient for the simple "binary subcommand flags"
 * shape these gate commands take; commands needing shell features should be
 * wrapped in a script the user points the gate at.
 *
 * The ProcessRunner seam keeps this unit-testable with a fake; the live binding
 * (NodeProcessRunner) shells out for real.
 */
import type { ProcessRunner } from "../ports/agent.ts";
import type { VerifyGate } from "../app/run-step.ts";
import type { GateOutcome } from "../domain/measured-verdict.ts";

export class CommandVerifyGate implements VerifyGate {
  constructor(
    private readonly commands: readonly string[],
    private readonly runner: ProcessRunner,
  ) {}

  async run(worktree: string): Promise<GateOutcome[]> {
    const outcomes: GateOutcome[] = [];
    for (const command of this.commands) {
      const trimmed = command.trim();
      if (trimmed.length === 0) continue;
      const [bin, ...args] = trimmed.split(/\s+/);
      const result = await this.runner.run(bin!, args, worktree);
      // Carry the combined output so combineVerdict can recognise a
      // "nothing to check yet" failure (ADR 0004): an empty source tree
      // (tsc TS18003) or empty test suite (bun "No tests found!").
      const output = `${result.stdout}\n${result.stderr}`.trim();
      outcomes.push({ command: trimmed, exitCode: result.exitCode, output });
    }
    return outcomes;
  }
}
