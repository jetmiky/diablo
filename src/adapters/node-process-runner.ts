/**
 * NodeProcessRunner is the live ProcessRunner binding. It exposes two spawn
 * modes that share the same process API but differ in stdio wiring:
 *
 *   - `run` captures stdout/stderr and resolves with them. This is the binding
 *     for headless, AFK steps whose output is parsed (the `run`/`refactor`
 *     agent pipeline, git plumbing).
 *   - `runInteractive` INHERITS the parent's stdio so a Socratic Pi session can
 *     prompt the human and read their keystrokes (init's skill setup, intake's
 *     grill/PRD/issues). Inherited stdio is not capturable, so it resolves with
 *     empty stdout/stderr and a meaningful exit code only.
 *
 * node:child_process is implemented by both Node and Bun, so the same binding
 * runs in development (bun) and in the published, node-targeted binary — unlike
 * a Bun.* global, which is undefined under plain `node`.
 *
 * This is the only place that touches the OS process API; it is validated by
 * the live smoke test and a real-command unit test.
 */
import { spawn } from "node:child_process";
import type { ProcessOutcome, ProcessRunner } from "../ports/agent.ts";

export class NodeProcessRunner implements ProcessRunner {
  run(
    command: string,
    args: string[],
    cwd: string,
    onLine?: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<ProcessOutcome> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

      // Per-step deadline (run-step) can abort a hung run: kill the child so the
      // OS process actually dies, then reject so the caller surfaces a timeout.
      // SIGTERM first; if the child ignores it, SIGKILL shortly after.
      let killed = false;
      const onAbort = () => {
        killed = true;
        child.kill("SIGTERM");
        const hardKill = setTimeout(() => child.kill("SIGKILL"), 2000);
        hardKill.unref?.();
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }

      let stdout = "";
      let stderr = "";
      // Carry for splitting stdout into complete lines for onLine: a chunk can
      // end mid-line, so we hold the tail until its newline arrives.
      let lineBuffer = "";

      const pushLine = (line: string) => {
        if (!onLine) return;
        try {
          onLine(line);
        } catch {
          // Streaming is best-effort: a sink throwing must never break the run.
        }
      };

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (!onLine) return;
        lineBuffer += text;
        let nl = lineBuffer.indexOf("\n");
        while (nl >= 0) {
          // Strip a trailing \r so CRLF streams deliver clean lines too.
          pushLine(lineBuffer.slice(0, nl).replace(/\r$/, ""));
          lineBuffer = lineBuffer.slice(nl + 1);
          nl = lineBuffer.indexOf("\n");
        }
      });
      child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

      child.on("error", reject);
      child.on("close", (code) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        // A deadline-driven kill is a failure, surfaced as a rejection so the
        // caller (run-step) maps it to a StepTimeoutError.
        if (killed) {
          reject(new Error(`Process aborted (killed by deadline) after running ${command}.`));
          return;
        }
        // Flush any final line that had no trailing newline.
        if (lineBuffer.length > 0) pushLine(lineBuffer.replace(/\r$/, ""));
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  }

  runInteractive(command: string, args: string[], cwd: string): Promise<ProcessOutcome> {
    return new Promise((resolve, reject) => {
      // stdio: "inherit" wires the child straight to the parent's terminal so
      // it can both print prompts AND read the human's answers. Nothing is
      // captured — stdout/stderr are returned empty by contract.
      const child = spawn(command, args, { cwd, stdio: "inherit" });

      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ stdout: "", stderr: "", exitCode: code ?? 0 });
      });
    });
  }
}
