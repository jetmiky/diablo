import { describe, expect, test } from "bun:test";
import { proposePlan, negotiateTurn } from "../src/app/plan-session.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PiResult } from "../src/domain/pi-result.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";
import { sessionIdFor } from "../src/domain/run-spec.ts";

class FakeFs implements FsPort {
  files = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }
  read(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
    return Promise.resolve(v);
  }
  write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }
  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
}

class FakeAgent implements AgentPort {
  calls: RunSpec[] = [];
  private replyText: string;
  constructor(replyText = "agent reply") {
    this.replyText = replyText;
  }
  run(spec: RunSpec): Promise<PiResult> {
    this.calls.push(spec);
    return Promise.resolve({
      text: this.replyText,
      stopReason: "stop",
      usage: { totalTokens: 1, cost: 0 },
    });
  }
}

const config = {
  issue: "billing-02",
  worktree: "/proj/.worktrees/billing-02",
  planPath: "/proj/.worktrees/billing-02/.plans/billing-02-plan.md",
  ticketPaths: ["/proj/.scratch/billing-02/01-fix.md"],
  plannerSkills: ["/skills/master-plan/SKILL.md"],
  runId: "run-123",
};

describe("proposePlan", () => {
  test("dispatches one architect step", async () => {
    const agent = new FakeAgent("approach summary");
    const fs = new FakeFs();
    await proposePlan({ agent, fs }, config);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.tier).toBe("architect");
  });

  test("injects planner skills as @file", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await proposePlan({ agent, fs }, config);

    const spec = agent.calls[0]!;
    expect(spec.skills).toContain("/skills/master-plan/SKILL.md");
  });

  test("injects ticket paths as inputs", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await proposePlan({ agent, fs }, config);

    const spec = agent.calls[0]!;
    expect(spec.inputs).toContain("/proj/.scratch/billing-02/01-fix.md");
  });

  test("instruction mentions planPath and asks for approach/risks/what-it-wont-do", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await proposePlan({ agent, fs }, config);

    const instruction = agent.calls[0]!.instruction;
    expect(instruction).toContain(config.planPath);
    expect(instruction.toLowerCase()).toMatch(/approach|summary/);
    expect(instruction.toLowerCase()).toMatch(/risk|assumption/);
  });

  test("appends engine plan-shape guidance (no zero-source stage; criteria trace to ticket)", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await proposePlan({ agent, fs }, config);

    const lower = agent.calls[0]!.instruction.toLowerCase();
    expect(lower).toMatch(/compilable|source file/); // issue #1 option C
    expect(lower).toMatch(/acceptance criteri/); // issue #2 option C
    expect(lower).toMatch(/ticket|not invent/);
  });

  test("uses stable runId from config", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await proposePlan({ agent, fs }, config);

    const spec = agent.calls[0]!;
    expect(spec.runId).toBe("run-123");
  });

  test("uses stage 'plan'", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await proposePlan({ agent, fs }, config);

    const spec = agent.calls[0]!;
    expect(spec.stage).toBe("plan");
  });

  test("returns the agent's reply text", async () => {
    const agent = new FakeAgent("here is my approach and risks");
    const fs = new FakeFs();
    const reply = await proposePlan({ agent, fs }, config);

    expect(reply).toBe("here is my approach and risks");
  });
});

describe("negotiateTurn", () => {
  test("dispatches one architect step", async () => {
    const agent = new FakeAgent("revised thinking");
    const fs = new FakeFs();
    await negotiateTurn({ agent, fs }, config, "what about edge case X?");

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.tier).toBe("architect");
  });

  test("embeds the user message in the instruction", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await negotiateTurn({ agent, fs }, config, "what about edge case X?");

    const instruction = agent.calls[0]!.instruction;
    expect(instruction).toContain("what about edge case X?");
  });

  test("instruction includes anti-sycophancy guidance", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await negotiateTurn({ agent, fs }, config, "change X");

    const instruction = agent.calls[0]!.instruction;
    expect(instruction.toLowerCase()).toMatch(/hypothesis|evaluate/);
    expect(instruction.toLowerCase()).toMatch(/do not agree reflexively|not an order/);
  });

  test("uses the same stable runId as proposePlan", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await negotiateTurn({ agent, fs }, config, "challenge");

    const spec = agent.calls[0]!;
    expect(spec.runId).toBe("run-123");
  });

  test("uses stage 'plan'", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await negotiateTurn({ agent, fs }, config, "challenge");

    const spec = agent.calls[0]!;
    expect(spec.stage).toBe("plan");
  });

  test("returns the agent's reply text", async () => {
    const agent = new FakeAgent("you're right, I'll revise");
    const fs = new FakeFs();
    const reply = await negotiateTurn({ agent, fs }, config, "challenge");

    expect(reply).toBe("you're right, I'll revise");
  });
});

describe("plan-session stable session id", () => {
  test("proposePlan and negotiateTurn build the SAME session id", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();

    await proposePlan({ agent, fs }, config);
    const proposeSpec = agent.calls[0]!;
    const proposeSessionId = sessionIdFor(proposeSpec);

    await negotiateTurn({ agent, fs }, config, "challenge");
    const negotiateSpec = agent.calls[1]!;
    const negotiateSessionId = sessionIdFor(negotiateSpec);

    expect(proposeSessionId).toBe(negotiateSessionId);
    expect(proposeSessionId).toContain("run-123"); // stable runId
    expect(proposeSessionId).toContain("plan"); // stage
  });
});
