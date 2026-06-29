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
