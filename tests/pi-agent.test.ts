import { describe, expect, test } from "bun:test";
import { PiAgent } from "../src/adapters/pi-agent.ts";
import type { ProcessOutcome, ProcessRunner } from "../src/ports/agent.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";

const spec: RunSpec = {
  tier: "worker",
  issue: "billing-02",
  stage: "stage-1",
  skills: ["/skills/tdd/SKILL.md"],
  inputs: ["./plan.md"],
  instruction: "Implement stage 1.",
  worktree: "/proj/.worktrees/billing-02",
};

const agentEndLine = JSON.stringify({
  type: "agent_end",
  messages: [
    {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      stopReason: "stop",
      usage: { totalTokens: 100, cost: { total: 0.01 } },
    },
  ],
});

class FakeRunner implements ProcessRunner {
  calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  constructor(private outcome: ProcessOutcome) {}
  run(command: string, args: string[], cwd: string): Promise<ProcessOutcome> {
    this.calls.push({ command, args, cwd });
    return Promise.resolve(this.outcome);
  }

  // PiAgent runs headless (-p, JSONL parsed from captured stdout), never
  // interactively. Present only to satisfy the ProcessRunner contract.
  runInteractive(): Promise<ProcessOutcome> {
    throw new Error("FakeRunner: runInteractive must not be used by PiAgent");
  }
}

describe("PiAgent", () => {
  test("spawns the pi binary in the step's worktree", async () => {
    const runner = new FakeRunner({ stdout: agentEndLine, stderr: "", exitCode: 0 });
    const agent = new PiAgent("/home/u/.bun/bin/pi", runner);
    await agent.run(spec);

    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.command).toBe("/home/u/.bun/bin/pi");
    expect(runner.calls[0]!.cwd).toBe(spec.worktree);
  });

  test("passes the built pi args (model, session-id, @files, instruction)", async () => {
    const runner = new FakeRunner({ stdout: agentEndLine, stderr: "", exitCode: 0 });
    const agent = new PiAgent("pi", runner);
    await agent.run(spec);

    const args = runner.calls[0]!.args;
    expect(args[args.indexOf("--model") + 1]).toBe("9router/kr/claude-sonnet-4.5:medium");
    expect(args[args.indexOf("--session-id") + 1]).toBe("diablo-billing-02-stage-1-worker");
    expect(args).toContain("@/skills/tdd/SKILL.md");
    expect(args[args.length - 1]).toBe("Implement stage 1.");
  });

  test("parses the JSONL stdout into a structured result", async () => {
    const runner = new FakeRunner({ stdout: agentEndLine, stderr: "", exitCode: 0 });
    const agent = new PiAgent("pi", runner);
    const result = await agent.run(spec);

    expect(result.text).toBe("done");
    expect(result.stopReason).toBe("stop");
    expect(result.usage.totalTokens).toBe(100);
    expect(result.usage.cost).toBe(0.01);
  });

  test("throws on a non-zero exit code, including stderr for diagnosis", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "boom: bad model", exitCode: 1 });
    const agent = new PiAgent("pi", runner);
    await expect(agent.run(spec)).rejects.toThrow(/code 1.*boom: bad model/s);
  });

  test("applies per-tier model overrides when constructed with them", async () => {
    const runner = new FakeRunner({ stdout: agentEndLine, stderr: "", exitCode: 0 });
    const agent = new PiAgent("pi", runner, {
      worker: { model: "claude-haiku-4.5", thinking: "medium" },
    });
    await agent.run(spec);

    const args = runner.calls[0]!.args;
    expect(args[args.indexOf("--model") + 1]).toBe("9router/kr/claude-haiku-4.5:medium");
  });

  test("stamps the run's runId into every step's session-id (cross-run isolation)", async () => {
    const runner = new FakeRunner({ stdout: agentEndLine, stderr: "", exitCode: 0 });
    const agent = new PiAgent("pi", runner, {}, "run-abc");
    await agent.run(spec);

    const args = runner.calls[0]!.args;
    expect(args[args.indexOf("--session-id") + 1]).toBe(
      "diablo-billing-02-run-abc-stage-1-worker",
    );
  });
});

// A runner that replays a scripted JSONL stream line-by-line into onLine, the
// way the live NodeProcessRunner streams Pi's --mode json stdout. Lets us prove
// PiAgent turns tool_execution_start events into activity labels.
class StreamingRunner implements ProcessRunner {
  constructor(private lines: string[]) {}
  run(
    _command: string,
    _args: string[],
    _cwd: string,
    onLine?: (line: string) => void,
  ): Promise<ProcessOutcome> {
    const stdout = this.lines.join("\n");
    if (onLine) for (const line of this.lines) onLine(line);
    return Promise.resolve({ stdout, stderr: "", exitCode: 0 });
  }
  runInteractive(): Promise<ProcessOutcome> {
    throw new Error("StreamingRunner: runInteractive must not be used by PiAgent");
  }
}

describe("PiAgent activity streaming", () => {
  const toolStart = (toolName: string, args: unknown) =>
    JSON.stringify({ type: "tool_execution_start", toolCallId: "t1", toolName, args });

  test("forwards each tool_execution_start as a human activity label", async () => {
    const activities: string[] = [];
    const runner = new StreamingRunner([
      `{"type":"agent_start"}`,
      toolStart("read", { path: "/proj/src/app/run-step.ts" }),
      toolStart("bash", { command: "bun test" }),
      agentEndLine,
    ]);
    const agent = new PiAgent("pi", runner);
    await agent.run(spec, (activity) => activities.push(activity));

    expect(activities).toEqual(["reading run-step.ts", "running `bun test`"]);
  });

  test("ignores non-tool lines (no activity for streaming noise)", async () => {
    const activities: string[] = [];
    const runner = new StreamingRunner([
      `{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hi"}}`,
      agentEndLine,
    ]);
    const agent = new PiAgent("pi", runner);
    await agent.run(spec, (activity) => activities.push(activity));

    expect(activities).toEqual([]);
  });

  test("runs fine when no onActivity callback is given (additive, optional)", async () => {
    const runner = new StreamingRunner([toolStart("edit", { path: "x.ts" }), agentEndLine]);
    const agent = new PiAgent("pi", runner);
    const result = await agent.run(spec);
    expect(result.text).toBe("done");
  });
});
