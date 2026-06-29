import { describe, expect, test } from "bun:test";
import { CommandVerifyGate } from "../src/adapters/command-verify-gate.ts";
import type { ProcessOutcome, ProcessRunner } from "../src/ports/agent.ts";

class FakeRunner implements ProcessRunner {
  calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  constructor(private byCommand: Record<string, number> = {}) {}
  run(command: string, args: string[], cwd: string): Promise<ProcessOutcome> {
    this.calls.push({ command, args, cwd });
    const key = [command, ...args].join(" ");
    return Promise.resolve({ stdout: "", stderr: "", exitCode: this.byCommand[key] ?? 0 });
  }
  runInteractive(): Promise<ProcessOutcome> {
    throw new Error("not used");
  }
}

describe("CommandVerifyGate", () => {
  test("runs each configured command in the worktree, returning their exit codes", async () => {
    const runner = new FakeRunner({ "bun test": 1 });
    const gate = new CommandVerifyGate(["bun run typecheck", "bun test"], runner);

    const outcomes = await gate.run("/proj/.worktrees/billing-02");

    expect(outcomes).toEqual([
      { command: "bun run typecheck", exitCode: 0 },
      { command: "bun test", exitCode: 1 },
    ]);
    // Each command is split into argv and run in the worktree cwd.
    expect(runner.calls).toEqual([
      { command: "bun", args: ["run", "typecheck"], cwd: "/proj/.worktrees/billing-02" },
      { command: "bun", args: ["test"], cwd: "/proj/.worktrees/billing-02" },
    ]);
  });

  test("no configured commands → runs nothing, returns no outcomes", async () => {
    const runner = new FakeRunner();
    const gate = new CommandVerifyGate([], runner);
    expect(await gate.run("/proj/wt")).toEqual([]);
    expect(runner.calls).toEqual([]);
  });

  test("runs ALL commands even after one fails (reports every gate's result)", async () => {
    const runner = new FakeRunner({ "bun run typecheck": 2 });
    const gate = new CommandVerifyGate(["bun run typecheck", "bun test"], runner);
    const outcomes = await gate.run("/proj/wt");
    expect(outcomes.map((o) => o.exitCode)).toEqual([2, 0]);
    expect(runner.calls).toHaveLength(2); // did not short-circuit
  });

  test("ignores empty / whitespace-only command entries", async () => {
    const runner = new FakeRunner();
    const gate = new CommandVerifyGate(["bun test", "  ", ""], runner);
    await gate.run("/proj/wt");
    expect(runner.calls).toHaveLength(1);
  });
});
