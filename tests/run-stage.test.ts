import { describe, expect, test } from "bun:test";
import { runStage, type Stage } from "../src/app/run-stage.ts";
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

// Agent returns a queued result per call, recording the tier order.
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

// Git hands out distinct SHAs in order so we can assert which commit wins.
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

describe("runStage", () => {
  test("runs every step in declared order", async () => {
    const agent = new SeqAgent([result("plan"), result("impl"), result("VERDICT: PASS")]);
    const git = new SeqGit();
    const stage: Stage = {
      issue: "billing-02",
      stage: "stage-1",
      steps: [
        step({ tier: "planner", commitMessage: "docs: stage-1 plan" }),
        step({ tier: "worker", commitMessage: "feat: stage-1 impl" }),
        step({ tier: "verifier" }), // no commit
      ],
    };

    const out = await runStage(deps(agent, git), stage);

    expect(agent.tiers).toEqual(["planner", "worker", "verifier"]);
    expect(out.steps).toHaveLength(3);
    expect(out.steps[2]!.text).toBe("VERDICT: PASS");
  });

  test("records the LAST committing step's SHA as the stage handoff commit", async () => {
    const agent = new SeqAgent([result("plan"), result("impl"), result("VERDICT: PASS")]);
    const git = new SeqGit();
    const stage: Stage = {
      issue: "billing-02",
      stage: "stage-1",
      steps: [
        step({ tier: "planner", commitMessage: "docs: stage-1 plan" }), // sha 1
        step({ tier: "worker", commitMessage: "feat: stage-1 impl" }), // sha 2
        step({ tier: "verifier" }), // no commit
      ],
    };

    const out = await runStage(deps(agent, git), stage);

    expect(git.commits).toHaveLength(2);
    expect(out.commit).toBe("2".repeat(40)); // worker's, not the verifier's (none) or planner's
  });

  test("leaves stage commit undefined when no step commits", async () => {
    const agent = new SeqAgent([result("VERDICT: PASS")]);
    const git = new SeqGit();
    const stage: Stage = {
      issue: "billing-02",
      stage: "stage-1",
      steps: [step({ tier: "verifier" })],
    };

    const out = await runStage(deps(agent, git), stage);
    expect(out.commit).toBeUndefined();
    expect(git.commits).toHaveLength(0);
  });

  test("stops at the first failing step and does not run later steps", async () => {
    const agent = new SeqAgent([result("plan"), { ...result("boom"), stopReason: "error" }]);
    const git = new SeqGit();
    const stage: Stage = {
      issue: "billing-02",
      stage: "stage-1",
      steps: [
        step({ tier: "planner", commitMessage: "docs: plan" }),
        step({ tier: "worker", commitMessage: "feat: impl" }), // errors
        step({ tier: "verifier" }), // must NOT run
      ],
    };

    await expect(runStage(deps(agent, git), stage)).rejects.toThrow(/error/i);
    expect(agent.tiers).toEqual(["planner", "worker"]); // verifier never ran
  });
});
