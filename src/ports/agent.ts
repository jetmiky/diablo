/**
 * AgentPort is the seam the conductor depends on to run a single coding-agent
 * step. The real implementation spawns Pi; tests use an in-memory fake. The
 * conductor never imports Pi directly — only this interface.
 */
import type { RunSpec } from "../domain/run-spec.ts";
import type { PiResult } from "../domain/pi-result.ts";

export interface AgentPort {
  /**
   * Run one coding-agent step. The optional `onActivity` callback is invoked
   * with a short human label ("editing run-step.ts", "running `bun test`")
   * each time the agent starts a tool, so a caller can show live progress
   * during the otherwise-silent run. Additive: callers that omit it are
   * unaffected.
   *
   * The optional `signal` aborts a long/hung run: when it fires, the adapter
   * kills the underlying process and rejects. The run loop wires this to a
   * per-step deadline so an unattended step cannot hang forever.
   */
  run(
    spec: RunSpec,
    onActivity?: (activity: string) => void,
    signal?: AbortSignal,
  ): Promise<PiResult>;
}

/**
 * ProcessRunner is the lower-level seam the Pi adapter depends on: it spawns a
 * command and returns its captured output. Injecting it keeps the adapter's
 * arg-building and output-parsing logic testable without spawning a real
 * process. The live binding spawns the actual `pi` binary.
 */
export interface ProcessOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessRunner {
  /**
   * Spawn a command and resolve with its captured output. The optional `onLine`
   * callback is invoked with each COMPLETE stdout line (newline stripped) as it
   * arrives, before the process closes — the streaming seam the live activity
   * indicator reads Pi's JSONL events through. The full stdout is still buffered
   * and returned for parsing; `onLine` is best-effort and additive, so callers
   * that don't pass it behave exactly as before.
   */
  run(
    command: string,
    args: string[],
    cwd: string,
    onLine?: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<ProcessOutcome>;
  /**
   * Like `run`, but inherits the parent's stdio so the child can prompt the
   * human and read their keystrokes — the binding for Socratic Pi sessions
   * (init's skill setup, intake's grill/PRD/issues). Because stdio is inherited
   * to the terminal, output is NOT captured: stdout/stderr come back empty and
   * only the exit code is meaningful. Never use this for steps whose output is
   * parsed (the `run`/`refactor` agent pipeline) — those must use `run`.
   */
  runInteractive(command: string, args: string[], cwd: string): Promise<ProcessOutcome>;
}
