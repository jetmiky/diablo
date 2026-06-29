/**
 * AgentPort is the seam the conductor depends on to run a single coding-agent
 * step. The real implementation spawns Pi; tests use an in-memory fake. The
 * conductor never imports Pi directly — only this interface.
 */
import type { RunSpec } from "../domain/run-spec.ts";
import type { PiResult } from "../domain/pi-result.ts";

export interface AgentPort {
  run(spec: RunSpec): Promise<PiResult>;
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
  run(command: string, args: string[], cwd: string): Promise<ProcessOutcome>;
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
