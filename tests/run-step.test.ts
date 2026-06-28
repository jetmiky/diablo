import { describe, expect, test } from "bun:test";
import { runStep, VerificationFailedError, type RunStepDeps, type Step } from "../src/app/run-step.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { GitPort } from "../src/ports/git.ts";
import type { PiResult } from "../src/domain/pi-result.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";

const baseStep: Step = {
  tier: "worker",
  issue: "billing-02",
  stage: "stage-1",
  skills: ["/skills/tdd/SKILL.md"],
  inputs: ["./plan.md"],
  instruction: "Implement stage 1.",
  worktree: "/proj/.worktrees/billing-02",
  commitMessage: "feat(billing): implement stage 1",
};

function fakeResult(over: Partial<PiResult> = {}): PiResult {
  return {
    text: "done",
    stopReason: "stop",
    usage: { totalTokens: 100, cost: 0.01 },
    ...over,
  };
}

class FakeAgent implements AgentPort {
  calls: RunSpec[] = [];
  constructor(private result: PiResult | (() => Promise<PiResult>)) {}
  run(spec: RunSpec): Promise<PiResult> {
    this.calls.push(spec);
    return typeof this.result === "function"
      ? this.result()
      : Promise.resolve(this.result);
  }
}

class FakeGit implements GitPort {
  commits: Array<{ worktree: string; message: string }> = [];
  worktreeAdd(): Promise<string> {
    throw new Error("not used");
  }
  commit(worktree: string, message: string): Promise<string> {
    this.commits.push({ worktree, message });
    return Promise.resolve("a".repeat(40));
  }
  headSha(): Promise<string> {
    return Promise.resolve("a".repeat(40));
  }
  diffStat(): Promise<string> {
    return Promise.resolve("");
  }
}

function deps(agent: AgentPort, git: GitPort): RunStepDeps {
  return { agent, git };
}

describe("runStep", () => {
  test("runs the agent with the step spec and returns text, stopReason, usage", async () => {
    const agent = new FakeAgent(fakeResult());
    const git = new FakeGit();
    const result = await runStep(deps(agent, git), baseStep);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.tier).toBe("worker");
    expect(agent.calls[0]!.worktree).toBe("/proj/.worktrees/billing-02");
    expect(result.text).toBe("done");
    expect(result.stopReason).toBe("stop");
    expect(result.usage.totalTokens).toBe(100);
  });

  test("commits the worktree and returns the SHA when commitMessage is set", async () => {
    const agent = new FakeAgent(fakeResult());
    const git = new FakeGit();
    const result = await runStep(deps(agent, git), baseStep);

    expect(git.commits).toHaveLength(1);
    expect(git.commits[0]!.worktree).toBe("/proj/.worktrees/billing-02");
    expect(git.commits[0]!.message).toBe("feat(billing): implement stage 1");
    expect(result.commit).toBe("a".repeat(40));
  });

  test("does NOT commit when commitMessage is absent (e.g. a verifier step)", async () => {
    const agent = new FakeAgent(fakeResult({ text: "VERDICT: PASS" }));
    const git = new FakeGit();
    const verifierStep: Step = {
      ...baseStep,
      tier: "verifier",
      commitMessage: undefined,
    };
    const result = await runStep(deps(agent, git), verifierStep);

    expect(git.commits).toHaveLength(0);
    expect(result.commit).toBeUndefined();
    expect(result.text).toBe("VERDICT: PASS");
  });

  test("commits AFTER the agent runs (never on a not-yet-run step)", async () => {
    const order: string[] = [];
    const agent = new FakeAgent(() => {
      order.push("agent");
      return Promise.resolve(fakeResult());
    });
    const git = new FakeGit();
    const tracking: GitPort = {
      worktreeAdd: (i, b) => git.worktreeAdd(i, b),
      headSha: (w) => git.headSha(w),
      diffStat: (w, b) => git.diffStat(w, b),
      commit: (w, m) => {
        order.push("commit");
        return git.commit(w, m);
      },
    };
    await runStep(deps(agent, tracking), baseStep);
    expect(order).toEqual(["agent", "commit"]);
  });

  test("does NOT commit and throws when the agent run ended in error", async () => {
    const agent = new FakeAgent(fakeResult({ stopReason: "error", text: "model blew up" }));
    const git = new FakeGit();
    await expect(runStep(deps(agent, git), baseStep)).rejects.toThrow(/error.*model blew up/s);
    expect(git.commits).toHaveLength(0);
  });

  test("propagates an agent failure without committing", async () => {
    const agent = new FakeAgent(() => Promise.reject(new Error("pi exited with code 1")));
    const git = new FakeGit();
    await expect(runStep(deps(agent, git), baseStep)).rejects.toThrow(/code 1/);
    expect(git.commits).toHaveLength(0);
  });
});

describe("runStep verifier verdict", () => {
  const verifierStep: Step = {
    ...baseStep,
    tier: "verifier",
    commitMessage: undefined,
  };

  test("a verifier returning VERDICT: PASS completes normally", async () => {
    const agent = new FakeAgent(fakeResult({ text: "ran tests, all green.\nVERDICT: PASS" }));
    const result = await runStep(deps(agent, new FakeGit()), verifierStep);
    expect(result.text).toContain("VERDICT: PASS");
    expect(result.commit).toBeUndefined();
  });

  test("a verifier returning VERDICT: FAIL throws VerificationFailedError", async () => {
    const agent = new FakeAgent(fakeResult({ text: "typecheck failed.\nVERDICT: FAIL" }));
    await expect(runStep(deps(agent, new FakeGit()), verifierStep)).rejects.toThrow(
      VerificationFailedError,
    );
  });

  test("a verifier with NO verdict line is treated as a failure (silence is not success)", async () => {
    const agent = new FakeAgent(fakeResult({ text: "looks fine to me" }));
    await expect(runStep(deps(agent, new FakeGit()), verifierStep)).rejects.toThrow(
      VerificationFailedError,
    );
  });

  test("the VerificationFailedError names the issue and stage for diagnosis", async () => {
    const agent = new FakeAgent(fakeResult({ text: "VERDICT: FAIL" }));
    await expect(runStep(deps(agent, new FakeGit()), verifierStep)).rejects.toThrow(
      /billing-02.*stage-1|stage-1.*billing-02/s,
    );
  });

  test("the verdict check applies ONLY to verifier-tier steps, not workers", async () => {
    // A worker's prose may contain no verdict line; that must never fail the step.
    const agent = new FakeAgent(fakeResult({ text: "implemented the feature" }));
    const result = await runStep(deps(agent, new FakeGit()), baseStep);
    expect(result.commit).toBe("a".repeat(40));
  });
});
