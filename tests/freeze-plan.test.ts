import { describe, expect, test } from "bun:test";
import { freezePlan } from "../src/app/freeze-plan.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PiResult } from "../src/domain/pi-result.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";
import { sessionIdFor } from "../src/domain/run-spec.ts";
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
  run(spec: RunSpec): Promise<PiResult> {
    this.calls.push(spec);
    return Promise.resolve({
      text: "plan rewritten and frozen",
      stopReason: "stop",
      usage: { totalTokens: 1, cost: 0 },
    });
  }
}

const config = {
  issue: "billing-02",
  worktree: "/proj/.worktrees/billing-02",
  planPath: "/proj/.worktrees/billing-02/.plans/billing-02-plan.md",
  diabloDir: "/proj/.diablo",
  plannerSkills: ["/skills/master-plan/SKILL.md"],
  runId: "run-123",
};

describe("freezePlan", () => {
  test("dispatches one architect step", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await freezePlan({ agent, fs }, config);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.tier).toBe("architect");
  });

  test("instruction tells planner to REWRITE planPath as frozen", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await freezePlan({ agent, fs }, config);

    const instruction = agent.calls[0]!.instruction;
    expect(instruction).toContain(config.planPath);
    expect(instruction.toLowerCase()).toMatch(/rewrite|frozen/);
  });

  test("instruction asks for 'Decisions & rationale' section", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await freezePlan({ agent, fs }, config);

    const instruction = agent.calls[0]!.instruction;
    expect(instruction).toMatch(/Decisions.*rationale/i);
  });

  test("uses stable runId from config (same session as proposal/negotiation)", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await freezePlan({ agent, fs }, config);

    const spec = agent.calls[0]!;
    expect(spec.runId).toBe("run-123");
  });

  test("uses stage 'plan'", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await freezePlan({ agent, fs }, config);

    const spec = agent.calls[0]!;
    expect(spec.stage).toBe("plan");
  });

  test("builds the same session id as proposePlan/negotiateTurn", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await freezePlan({ agent, fs }, config);

    const spec = agent.calls[0]!;
    const sessionId = sessionIdFor(spec);
    expect(sessionId).toContain("run-123");
    expect(sessionId).toContain("plan");
    expect(sessionId).toContain("billing-02");
  });

  test("persists issue status as 'planned'", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await freezePlan({ agent, fs }, config);

    const status = await readStatus({ fs }, { diabloDir: config.diabloDir, issue: config.issue });
    expect(status).toBe("planned");
  });

  test("status file contains updatedAt timestamp", async () => {
    const agent = new FakeAgent();
    const fs = new FakeFs();
    await freezePlan({ agent, fs }, config);

    const statePath = `${config.diabloDir}/${config.issue}/state.json`;
    const content = await fs.read(statePath);
    const json = JSON.parse(content);
    expect(json.status).toBe("planned");
    expect(json.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });
});
