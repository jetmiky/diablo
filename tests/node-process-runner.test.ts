import { describe, expect, test } from "bun:test";
import { NodeProcessRunner } from "../src/adapters/node-process-runner.ts";

// Exercises the real node:child_process spawn against tiny, deterministic
// commands — fast and hermetic, no Pi or git needed. This is the binding that
// must work under BOTH bun (dev) and node (published binary).
describe("NodeProcessRunner", () => {
  const runner = new NodeProcessRunner();

  test("captures stdout and a zero exit code", async () => {
    const out = await runner.run("node", ["-e", "process.stdout.write('hello')"], process.cwd());
    expect(out.stdout).toBe("hello");
    expect(out.exitCode).toBe(0);
  });

  test("captures stderr", async () => {
    const out = await runner.run("node", ["-e", "process.stderr.write('boom')"], process.cwd());
    expect(out.stderr).toBe("boom");
  });

  test("surfaces a non-zero exit code", async () => {
    const out = await runner.run("node", ["-e", "process.exit(3)"], process.cwd());
    expect(out.exitCode).toBe(3);
  });

  test("runs in the given working directory", async () => {
    const out = await runner.run("node", ["-e", "process.stdout.write(process.cwd())"], "/tmp");
    expect(out.stdout).toBe("/tmp");
  });

  test("rejects when the command does not exist", async () => {
    await expect(
      runner.run("definitely-not-a-real-binary-xyz", [], process.cwd()),
    ).rejects.toThrow();
  });
});

// runInteractive is the binding for Socratic Pi sessions (init's skill setup,
// intake's grill/PRD/issues). Unlike `run`, it inherits the parent's stdio so
// the child can prompt the human and read their keystrokes — which means it
// does NOT capture output. These tests pin that contract: exit codes still
// propagate, errors still reject, but stdout/stderr come back empty because
// they went to the terminal, not into the result.
describe("NodeProcessRunner.runInteractive", () => {
  const runner = new NodeProcessRunner();

  test("does NOT capture stdout (it is inherited to the terminal)", async () => {
    const out = await runner.runInteractive(
      "node",
      ["-e", "process.stdout.write('hello')"],
      process.cwd(),
    );
    expect(out.stdout).toBe("");
    expect(out.exitCode).toBe(0);
  });

  test("does NOT capture stderr (it is inherited to the terminal)", async () => {
    const out = await runner.runInteractive(
      "node",
      ["-e", "process.stderr.write('boom')"],
      process.cwd(),
    );
    expect(out.stderr).toBe("");
  });

  test("surfaces a non-zero exit code", async () => {
    const out = await runner.runInteractive("node", ["-e", "process.exit(3)"], process.cwd());
    expect(out.exitCode).toBe(3);
  });

  test("runs in the given working directory", async () => {
    // cwd is observable via an exit code rather than captured stdout, since
    // interactive output is not captured.
    const out = await runner.runInteractive(
      "node",
      ["-e", "process.exit(process.cwd() === '/tmp' ? 0 : 1)"],
      "/tmp",
    );
    expect(out.exitCode).toBe(0);
  });

  test("rejects when the command does not exist", async () => {
    await expect(
      runner.runInteractive("definitely-not-a-real-binary-xyz", [], process.cwd()),
    ).rejects.toThrow();
  });
});
