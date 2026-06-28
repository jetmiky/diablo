/**
 * BunProcessRunner is the live ProcessRunner binding: it spawns a real process
 * with Bun, captures stdout/stderr, and resolves when the process exits. This
 * is the only place that touches the OS process API; it is validated by the
 * live smoke test, not unit tests.
 */
import type { ProcessOutcome, ProcessRunner } from "../ports/agent.ts";

export class BunProcessRunner implements ProcessRunner {
  async run(command: string, args: string[], cwd: string): Promise<ProcessOutcome> {
    const proc = Bun.spawn([command, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return { stdout, stderr, exitCode };
  }
}
