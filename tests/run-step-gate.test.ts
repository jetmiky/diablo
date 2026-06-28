import { describe, expect, test } from "bun:test";
import { runStep, type RunStepDeps, type Step } from "../src/app/run-step.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { GitPort } from "../src/ports/git.ts";
import type { GatePort, GateRequest } from "../src/ports/gate.ts";
import { GateDeclinedError } from "../src/ports/gate.ts";
import type { PiResult } from "../src/domain/pi-result.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";

const WT = "/proj/.worktrees/billing-02";

function step(over: Partial<Step>): Step {
  return {
    tier: "worker",
    issue: "billing-02",
    stage: "stage-1",
    skills: [],
    inputs: [],
    instruction: "do the thing",
    worktree: WT,
    ...over,
  };
}

const okResult: PiResult = { text: "done", stopReason: "stop", usage: { totalTokens: 10, cost: 0 } };

class FakeAgent implements AgentPort {
  ran = false;
  run(_spec: RunSpec): Promise<PiResult> {
    this.ran = true;
    return Promise.resolve(okResult);
  }
}

class FakeGit implements GitPort {
  commits: string[] = [];
  worktreeAdd(): Promise<string> {
    return Promise.reject(new Error("not used"));
  }
  commit(_w: string, m: string): Promise<string> {
    this.commits.push(m);
    return Promise.resolve("c".repeat(40));
  }
  headSha(): Promise<string> {
    return Promise.resolve("c".repeat(40));
  }
  diffStat(): Promise<string> {
    return Promise.resolve("");
  }
}

class FakeGate implements GatePort {
  requests: GateRequest[] = [];
  constructor(private decision: boolean) {}
  confirm(request: GateRequest): Promise<boolean> {
    this.requests.push(request);
    return Promise.resolve(this.decision);
  }
}

describe("runStep with gates", () => {
  test("proceeds when an approval gate confirms, returning the result", async () => {
    const gate = new FakeGate(true);
    const deps: RunStepDeps = { agent: new FakeAgent(), git: new FakeGit(), gate };
    const result = await runStep(deps, step({ gate: "approval", commitMessage: "feat: x" }));

    expect(gate.requests).toHaveLength(1);
    expect(result.text).toBe("done");
    expect(result.commit).toBe("c".repeat(40));
  });

  test("passes the commit and summary to the gate so the human approves real work", async () => {
    const gate = new FakeGate(true);
    const deps: RunStepDeps = { agent: new FakeAgent(), git: new FakeGit(), gate };
    await runStep(deps, step({ gate: "approval", commitMessage: "feat: x" }));

    expect(gate.requests[0]!.commit).toBe("c".repeat(40));
    expect(gate.requests[0]!.summary).toBe("done");
    expect(gate.requests[0]!.tier).toBe("worker");
  });

  test("throws GateDeclinedError when an approval gate declines", async () => {
    const gate = new FakeGate(false);
    const deps: RunStepDeps = { agent: new FakeAgent(), git: new FakeGit(), gate };
    await expect(
      runStep(deps, step({ gate: "approval", commitMessage: "feat: x" })),
    ).rejects.toBeInstanceOf(GateDeclinedError);
  });

  test("consults the gate AFTER committing (human approves committed work)", async () => {
    const order: string[] = [];
    const git = new FakeGit();
    const trackingGit: GitPort = {
      worktreeAdd: (i, b) => git.worktreeAdd(i, b),
      headSha: (w) => git.headSha(w),
      diffStat: (w, b) => git.diffStat(w, b),
      commit: (w, m) => {
        order.push("commit");
        return git.commit(w, m);
      },
    };
    const gate: GatePort = {
      confirm: () => {
        order.push("gate");
        return Promise.resolve(true);
      },
    };
    const deps: RunStepDeps = { agent: new FakeAgent(), git: trackingGit, gate };
    await runStep(deps, step({ gate: "approval", commitMessage: "feat: x" }));

    expect(order).toEqual(["commit", "gate"]);
  });

  test("a gate:'none' step never consults the gate", async () => {
    const gate = new FakeGate(false); // would decline if asked
    const deps: RunStepDeps = { agent: new FakeAgent(), git: new FakeGit(), gate };
    const result = await runStep(deps, step({ gate: "none", commitMessage: "feat: x" }));

    expect(gate.requests).toHaveLength(0);
    expect(result.commit).toBe("c".repeat(40));
  });

  test("a step with no gate field never consults the gate (default path unchanged)", async () => {
    const gate = new FakeGate(false);
    const deps: RunStepDeps = { agent: new FakeAgent(), git: new FakeGit(), gate };
    const result = await runStep(deps, step({ commitMessage: "feat: x" }));

    expect(gate.requests).toHaveLength(0);
    expect(result.commit).toBe("c".repeat(40));
  });

  test("throws a clear error if an approval gate is requested but no GatePort is provided", async () => {
    const deps: RunStepDeps = { agent: new FakeAgent(), git: new FakeGit() }; // no gate
    await expect(
      runStep(deps, step({ gate: "approval", commitMessage: "feat: x" })),
    ).rejects.toThrow(/no GatePort/i);
  });
});
