import { describe, expect, test } from "bun:test";
import { runStage, type Stage } from "../src/app/run-stage.ts";
import { VerificationFailedError, type RunStepDeps, type Step } from "../src/app/run-step.ts";
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

function res(text: string): PiResult {
  return { text, stopReason: "stop", usage: { totalTokens: 10, cost: 0 } };
}

/** Records every spec it runs (with instruction) and returns queued results. */
class SeqAgent implements AgentPort {
  specs: RunSpec[] = [];
  constructor(private results: PiResult[]) {}
  run(spec: RunSpec): Promise<PiResult> {
    this.specs.push(spec);
    const r = this.results.shift();
    if (!r) throw new Error("SeqAgent: out of results");
    return Promise.resolve(r);
  }
  tiers(): string[] {
    return this.specs.map((s) => s.tier);
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

function implStage(): Stage {
  return {
    issue: "billing-02",
    stage: "stage-1",
    steps: [
      step({ tier: "worker", commitMessage: "feat: stage-1" }),
      step({ tier: "verifier", commitMessage: undefined }),
    ],
  };
}

describe("runStage retry", () => {
  test("default (no retry config) still halts on verifier FAIL — no regression", async () => {
    const agent = new SeqAgent([res("impl"), res("VERDICT: FAIL [implementation]")]);
    await expect(runStage(deps(agent, new SeqGit()), implStage())).rejects.toThrow(
      VerificationFailedError,
    );
    expect(agent.tiers()).toEqual(["worker", "verifier"]); // ran once each, no retry
  });

  test("an implementation FAIL re-runs the worker then re-verifies; a later PASS succeeds", async () => {
    const agent = new SeqAgent([
      res("first impl"),
      res("typecheck broke.\nVERDICT: FAIL [implementation]"),
      res("fixed impl"),
      res("all green.\nVERDICT: PASS"),
    ]);
    const git = new SeqGit();
    const out = await runStage(deps(agent, git), implStage(), { limit: 2 });

    expect(agent.tiers()).toEqual(["worker", "verifier", "worker", "verifier"]);
    expect(git.commits).toHaveLength(2); // original + retry fix
    expect(out.commit).toBe("2".repeat(40)); // the retry's commit is the handoff
  });

  test("the re-run worker receives the verifier's feedback", async () => {
    const agent = new SeqAgent([
      res("first impl"),
      res("the function signature is wrong.\nVERDICT: FAIL [implementation]"),
      res("fixed impl"),
      res("VERDICT: PASS"),
    ]);
    await runStage(deps(agent, new SeqGit()), implStage(), { limit: 2 });

    const retryWorkerSpec = agent.specs[2]!; // second worker run
    expect(retryWorkerSpec.tier).toBe("worker");
    expect(retryWorkerSpec.instruction).toMatch(/signature is wrong|feedback|previous attempt/i);
  });

  test("a [plan] FAIL halts immediately without retrying", async () => {
    const agent = new SeqAgent([res("impl"), res("the plan is wrong.\nVERDICT: FAIL [plan]")]);
    await expect(runStage(deps(agent, new SeqGit()), implStage(), { limit: 3 })).rejects.toThrow(
      VerificationFailedError,
    );
    expect(agent.tiers()).toEqual(["worker", "verifier"]); // no worker re-run
  });

  test("retries are bounded by the limit; exhausting it halts", async () => {
    // limit 2 → worker runs 1 + 2 = 3 times, each verify FAILs, then halts.
    const agent = new SeqAgent([
      res("impl a"),
      res("VERDICT: FAIL [implementation]"),
      res("impl b"),
      res("VERDICT: FAIL [implementation]"),
      res("impl c"),
      res("VERDICT: FAIL [implementation]"),
    ]);
    await expect(runStage(deps(agent, new SeqGit()), implStage(), { limit: 2 })).rejects.toThrow(
      VerificationFailedError,
    );
    expect(agent.tiers()).toEqual([
      "worker",
      "verifier",
      "worker",
      "verifier",
      "worker",
      "verifier",
    ]);
  });

  test("a verification-only stage (verifier, no worker) is not retried", async () => {
    const agent = new SeqAgent([res("VERDICT: FAIL [implementation]")]);
    const stage: Stage = {
      issue: "billing-02",
      stage: "stage-9",
      steps: [step({ tier: "verifier", commitMessage: undefined })],
    };
    await expect(runStage(deps(agent, new SeqGit()), stage, { limit: 3 })).rejects.toThrow(
      VerificationFailedError,
    );
    expect(agent.tiers()).toEqual(["verifier"]); // nothing to re-run
  });

  // --- issue #2: the FINAL whole-feature verification (a planner-tier step with
  // verifies:true and NO worker in its step list) must be recoverable. A
  // code-fixable FAIL there routes to the stage's recoveryWorker, then
  // re-verifies — instead of halting unrecoverably after every stage passed. ---

  function finalVerifyStage(over: Partial<Stage> = {}): Stage {
    return {
      issue: "billing-02",
      stage: "stage-9",
      steps: [step({ tier: "planner-med", verifies: true, commitMessage: undefined })],
      recoveryWorker: step({ tier: "worker", commitMessage: "fix(billing-02): final verification recovery" }),
      ...over,
    };
  }

  test("the final verification's implementation FAIL runs the recoveryWorker then re-verifies; a later PASS succeeds", async () => {
    const agent = new SeqAgent([
      res("type assertion flagged.\nVERDICT: FAIL [implementation]"),
      res("removed the assertion"),
      res("all green.\nVERDICT: PASS"),
    ]);
    const git = new SeqGit();
    const out = await runStage(deps(agent, git), finalVerifyStage(), { limit: 2 });

    // verifier(planner-med) FAIL → recovery worker → re-verify → PASS
    expect(agent.tiers()).toEqual(["planner-med", "worker", "planner-med"]);
    expect(git.commits).toHaveLength(1); // the recovery fix committed
    expect(out.commit).toBe("1".repeat(40));
  });

  test("the recoveryWorker receives the final verifier's feedback", async () => {
    const agent = new SeqAgent([
      res("the parseCurrency cast violates T-008.\nVERDICT: FAIL [implementation]"),
      res("fixed"),
      res("VERDICT: PASS"),
    ]);
    await runStage(deps(agent, new SeqGit()), finalVerifyStage(), { limit: 2 });

    const recoverySpec = agent.specs[1]!;
    expect(recoverySpec.tier).toBe("worker");
    expect(recoverySpec.instruction).toMatch(/parseCurrency|T-008|feedback|previous attempt/i);
  });

  test("a final-verification [plan] FAIL still halts immediately (never auto-recovers a plan defect)", async () => {
    const agent = new SeqAgent([res("the plan is wrong.\nVERDICT: FAIL [plan]")]);
    await expect(
      runStage(deps(agent, new SeqGit()), finalVerifyStage(), { limit: 3 }),
    ).rejects.toThrow(VerificationFailedError);
    expect(agent.tiers()).toEqual(["planner-med"]); // no recovery on a plan defect
  });

  test("a final verification with NO recoveryWorker halts on FAIL (back-compat)", async () => {
    const agent = new SeqAgent([res("VERDICT: FAIL [implementation]")]);
    const stage = finalVerifyStage({ recoveryWorker: undefined });
    await expect(runStage(deps(agent, new SeqGit()), stage, { limit: 3 })).rejects.toThrow(
      VerificationFailedError,
    );
    expect(agent.tiers()).toEqual(["planner-med"]); // nothing to re-run
  });

  test("recovery retries are bounded by the limit; exhausting it halts", async () => {
    const agent = new SeqAgent([
      res("VERDICT: FAIL [implementation]"),
      res("fix a"),
      res("VERDICT: FAIL [implementation]"),
      res("fix b"),
      res("VERDICT: FAIL [implementation]"),
    ]);
    await expect(
      runStage(deps(agent, new SeqGit()), finalVerifyStage(), { limit: 2 }),
    ).rejects.toThrow(VerificationFailedError);
    expect(agent.tiers()).toEqual([
      "planner-med",
      "worker",
      "planner-med",
      "worker",
      "planner-med",
    ]);
  });
});
