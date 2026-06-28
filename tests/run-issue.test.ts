import { describe, expect, test } from "bun:test";
import { runIssue, type Issue } from "../src/app/run-issue.ts";
import type { Stage } from "../src/app/run-stage.ts";
import type { RunStepDeps, Step } from "../src/app/run-step.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { GitPort } from "../src/ports/git.ts";
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

function result(text: string): PiResult {
  return { text, stopReason: "stop", usage: { totalTokens: 10, cost: 0 } };
}

class SeqAgent implements AgentPort {
  tiers: string[] = [];
  constructor(private results: PiResult[]) {}
  run(spec: RunSpec): Promise<PiResult> {
    this.tiers.push(spec.tier);
    const r = this.results.shift();
    if (!r) throw new Error("SeqAgent: out of results");
    return Promise.resolve(r);
  }
}

class SeqGit implements GitPort {
  commits: Array<{ worktree: string; message: string }> = [];
  private n = 0;
  worktreeAdd(): Promise<string> {
    return Promise.reject(new Error("not used"));
  }
  commit(worktree: string, message: string): Promise<string> {
    this.commits.push({ worktree, message });
    this.n += 1;
    return Promise.resolve(String(this.n).repeat(40).slice(0, 40));
  }
  headSha(): Promise<string> {
    return Promise.resolve("0".repeat(40));
  }
  diffStat(): Promise<string> {
    return Promise.resolve("");
  }
}

const deps = (agent: AgentPort, git: GitPort): RunStepDeps => ({ agent, git });

function workerStage(name: string): Stage {
  return {
    issue: "billing-02",
    stage: name,
    steps: [
      step({ tier: "worker", stage: name, commitMessage: `feat: ${name}` }),
      step({ tier: "verifier", stage: name }),
    ],
  };
}

describe("runIssue", () => {
  test("runs every stage in order", async () => {
    const agent = new SeqAgent([
      result("impl-1"), result("ok-1"),
      result("impl-2"), result("ok-2"),
    ]);
    const git = new SeqGit();
    const issue: Issue = {
      issue: "billing-02",
      stages: [workerStage("stage-1"), workerStage("stage-2")],
    };

    const out = await runIssue(deps(agent, git), issue);

    expect(out.stages).toHaveLength(2);
    expect(out.stages[0]!.steps).toHaveLength(2);
    expect(out.stages[1]!.steps).toHaveLength(2);
  });

  test("threads each stage's handoff commit forward; final commit is the last stage's", async () => {
    const agent = new SeqAgent([
      result("impl-1"), result("ok-1"),
      result("impl-2"), result("ok-2"),
    ]);
    const git = new SeqGit();
    const issue: Issue = {
      issue: "billing-02",
      stages: [workerStage("stage-1"), workerStage("stage-2")],
    };

    const out = await runIssue(deps(agent, git), issue);

    expect(out.stages[0]!.commit).toBe("1".repeat(40));
    expect(out.stages[1]!.commit).toBe("2".repeat(40));
    expect(out.commit).toBe("2".repeat(40)); // the issue's final handoff token
  });

  test("stops at the first failing stage and does not run later stages", async () => {
    const agent = new SeqAgent([
      result("impl-1"), result("ok-1"),
      { ...result("boom"), stopReason: "error" }, // stage-2 worker errors
    ]);
    const git = new SeqGit();
    const issue: Issue = {
      issue: "billing-02",
      stages: [workerStage("stage-1"), workerStage("stage-2"), workerStage("stage-3")],
    };

    await expect(runIssue(deps(agent, git), issue)).rejects.toThrow(/error/i);
    // stage-1 worker+verifier, stage-2 worker (errors); stage-3 never starts
    expect(agent.tiers).toEqual(["worker", "verifier", "worker"]);
  });

  test("an issue with no stages produces no commit and runs nothing", async () => {
    const agent = new SeqAgent([]);
    const git = new SeqGit();
    const out = await runIssue(deps(agent, git), { issue: "billing-02", stages: [] });
    expect(out.stages).toHaveLength(0);
    expect(out.commit).toBeUndefined();
    expect(agent.tiers).toEqual([]);
  });
});
