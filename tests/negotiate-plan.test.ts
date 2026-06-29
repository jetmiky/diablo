import { describe, expect, test } from "bun:test";
import { negotiatePlan, type NegotiatePlanDeps, type NegotiatePlanConfig } from "../src/app/negotiate-plan.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PromptPort } from "../src/ports/prompt.ts";
import type { PiResult } from "../src/domain/pi-result.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";
import { readStatus } from "../src/app/issue-status-store.ts";

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
  private replies: string[];
  private callIndex = 0;

  constructor(replies: string[]) {
    this.replies = replies;
  }

  run(spec: RunSpec): Promise<PiResult> {
    this.calls.push(spec);
    const text = this.replies[this.callIndex] ?? "default reply";
    this.callIndex++;
    return Promise.resolve({ text, stopReason: "stop", usage: { totalTokens: 1, cost: 0 } });
  }
}

class FakePrompt implements PromptPort {
  private answers: string[];
  private answerIndex = 0;
  askCalls: string[] = [];

  constructor(answers: string[]) {
    this.answers = answers;
  }

  confirm(): Promise<boolean> {
    throw new Error("confirm not used by negotiate-plan");
  }

  select(): Promise<string> {
    throw new Error("select not used by negotiate-plan");
  }

  ask(question: string): Promise<string> {
    this.askCalls.push(question);
    const answer = this.answers[this.answerIndex] ?? "approve";
    this.answerIndex++;
    return Promise.resolve(answer);
  }
}

const config: NegotiatePlanConfig = {
  issue: "billing-02",
  worktree: "/proj/.worktrees/billing-02",
  planPath: "/proj/.worktrees/billing-02/.plans/billing-02-plan.md",
  ticketPaths: ["/proj/.scratch/billing-02/01-fix.md"],
  plannerSkills: ["/skills/master-plan/SKILL.md"],
  runId: "test-run-123",
  diabloDir: ".diablo",
};

function deps(agent: AgentPort, fs: FsPort, prompt: PromptPort, print: (line: string) => void): NegotiatePlanDeps {
  return { agent, fs, prompt, print };
}

describe("negotiatePlan", () => {
  test("approve on first turn: proposes, freezes, returns frozen", async () => {
    const agent = new FakeAgent([
      "Initial plan summary with approach and risks",
      "Frozen plan with rationale",
    ]);
    const fs = new FakeFs();
    const prompt = new FakePrompt(["approve"]);
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);

    const result = await negotiatePlan(deps(agent, fs, prompt, print), config);

    expect(result).toBe("frozen");
    expect(agent.calls).toHaveLength(2); // proposePlan + freezePlan
    expect(agent.calls[0]!.stage).toBe("plan");
    expect(agent.calls[1]!.stage).toBe("plan");
    
    // Verify freeze happened (status persisted as "planned")
    const status = await readStatus({ fs }, { diabloDir: config.diabloDir, issue: config.issue });
    expect(status).toBe("planned");
    
    // Verify printed the proposal and the frozen message
    expect(printed).toContain("Initial plan summary with approach and risks");
    expect(printed.some(line => line.includes("frozen") && line.includes("planned"))).toBe(true);
  });

  test("one challenge then approve: proposes, negotiates, freezes, returns frozen", async () => {
    const agent = new FakeAgent([
      "Initial plan summary",
      "Response to challenge",
      "Frozen plan",
    ]);
    const fs = new FakeFs();
    const prompt = new FakePrompt(["What about edge case X?", "approve"]);
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);

    const result = await negotiatePlan(deps(agent, fs, prompt, print), config);

    expect(result).toBe("frozen");
    expect(agent.calls).toHaveLength(3); // proposePlan + negotiateTurn + freezePlan
    
    // Verify the challenge was embedded in the negotiation turn
    const negotiateSpec = agent.calls[1]!;
    expect(negotiateSpec.instruction).toContain("What about edge case X?");
    
    // Verify printed proposal, challenge reply, and frozen message
    expect(printed).toContain("Initial plan summary");
    expect(printed).toContain("Response to challenge");
    expect(printed.some(line => line.includes("frozen"))).toBe(true);
  });

  test("abort: proposes, returns aborted, NO freeze, status NOT planned", async () => {
    const agent = new FakeAgent(["Initial plan summary"]);
    const fs = new FakeFs();
    const prompt = new FakePrompt(["abort"]);
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);

    const result = await negotiatePlan(deps(agent, fs, prompt, print), config);

    expect(result).toBe("aborted");
    expect(agent.calls).toHaveLength(1); // only proposePlan, NO freeze
    
    // Verify status was NOT set to "planned"
    const status = await readStatus({ fs }, { diabloDir: config.diabloDir, issue: config.issue });
    expect(status).toBe("open"); // default status
  });

  test("abort with leading slash is recognized", async () => {
    const agent = new FakeAgent(["Initial plan summary"]);
    const fs = new FakeFs();
    const prompt = new FakePrompt(["/abort"]);
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);

    const result = await negotiatePlan(deps(agent, fs, prompt, print), config);

    expect(result).toBe("aborted");
  });

  test("abort is case-insensitive", async () => {
    const agent = new FakeAgent(["Initial plan summary"]);
    const fs = new FakeFs();
    const prompt = new FakePrompt(["ABORT"]);
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);

    const result = await negotiatePlan(deps(agent, fs, prompt, print), config);

    expect(result).toBe("aborted");
  });

  test("multiple challenges then approve", async () => {
    const agent = new FakeAgent([
      "Initial plan",
      "Reply 1",
      "Reply 2",
      "Frozen",
    ]);
    const fs = new FakeFs();
    const prompt = new FakePrompt(["challenge 1", "challenge 2", "approve"]);
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);

    const result = await negotiatePlan(deps(agent, fs, prompt, print), config);

    expect(result).toBe("frozen");
    expect(agent.calls).toHaveLength(4); // propose + 2 negotiates + freeze
    expect(printed).toHaveLength(4); // proposal + 2 replies + frozen message
  });

  test("reopen is treated as a challenge (plan is already a draft)", async () => {
    const agent = new FakeAgent([
      "Initial plan",
      "Response to reopen",
      "Frozen",
    ]);
    const fs = new FakeFs();
    const prompt = new FakePrompt(["reopen", "approve"]);
    const printed: string[] = [];
    const print = (line: string) => printed.push(line);

    const result = await negotiatePlan(deps(agent, fs, prompt, print), config);

    expect(result).toBe("frozen");
    // reopen triggers a negotiate turn (treated as a challenge during draft)
    expect(agent.calls).toHaveLength(3); // propose + negotiate + freeze
  });
});
