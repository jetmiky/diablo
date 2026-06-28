/**
 * NodeProcessRunner is the live ProcessRunner binding: it spawns a real process
 * with node:child_process, captures stdout/stderr, and resolves when the
 * process exits. node:child_process is implemented by both Node and Bun, so the
 * same binding runs in development (bun) and in the published, node-targeted
 * binary — unlike a Bun.* global, which is undefined under plain `node`.
 *
 * This is the only place that touches the OS process API; it is validated by
 * the live smoke test and a real-command unit test.
 */
import { spawn } from "node:child_process";
import type { ProcessOutcome, ProcessRunner } from "../ports/agent.ts";

export class NodeProcessRunner implements ProcessRunner {
  run(command: string, args: string[], cwd: string): Promise<ProcessOutcome> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  }
}
