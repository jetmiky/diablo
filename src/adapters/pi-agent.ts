/**
 * PiAgent is the real AgentPort: it turns a RunSpec into pi argv, spawns the
 * pi binary in the step's worktree via an injected ProcessRunner, and parses
 * the JSONL stdout into a structured result.
 *
 * The ProcessRunner seam keeps this logic unit-testable with a fake; the live
 * binding (NodeProcessRunner) is exercised by the smoke test, not unit tests.
 */
import type { AgentPort, ProcessRunner } from "../ports/agent.ts";
import { buildPiArgs, type ModelOverrides, type RunSpec } from "../domain/run-spec.ts";
import { parsePiResult, type PiResult } from "../domain/pi-result.ts";
import { parsePiActivity } from "../domain/pi-activity.ts";
import { parsePiThought } from "../domain/pi-thought.ts";

export class PiAgent implements AgentPort {
  constructor(
    private readonly piBinary: string,
    private readonly runner: ProcessRunner,
    private readonly overrides: ModelOverrides = {},
    private readonly runId?: string,
  ) {}

  async run(spec: RunSpec, onActivity?: (activity: string) => void): Promise<PiResult> {
    const stamped = this.runId ? { ...spec, runId: this.runId } : spec;
    const args = buildPiArgs(stamped, this.overrides);

    // Stream Pi's JSONL stdout line-by-line, surfacing a live activity label:
    // a tool_execution_start ("editing run-step.ts") when the agent acts, or an
    // assistant text/thinking delta ("Let me check the parser") when it reasons.
    // Both ride the same onActivity channel — the heartbeat shows whichever
    // arrived most recently. Wired only when a caller wants activity, so a plain
    // run pays nothing for the line-splitting.
    const onLine = onActivity
      ? (line: string) => {
          const activity = parsePiActivity(line) ?? parsePiThought(line);
          if (activity) onActivity(activity);
        }
      : undefined;

    const outcome = await this.runner.run(this.piBinary, args, stamped.worktree, onLine);

    if (outcome.exitCode !== 0) {
      throw new Error(
        `Pi exited with code ${outcome.exitCode} for ${stamped.tier} step ` +
          `(${stamped.issue}/${stamped.stage}).\n${outcome.stderr.trim()}`,
      );
    }

    return parsePiResult(outcome.stdout);
  }
}
