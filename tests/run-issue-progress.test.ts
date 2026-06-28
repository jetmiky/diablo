import { describe, expect, test } from "bun:test";
import { runIssue, type Issue } from "../src/app/run-issue.ts";
import type { Stage } from "../src/app/run-stage.ts";
import type { RunStepDeps, Step } from "../src/app/run-step.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { GitPort } from "../src/ports/git.ts";
import type { PiResult } from "../src/domain/pi-result.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";
import type { ProgressEvent, ProgressPort } from "../src/ports/progress.ts";

const WT = "/proj/.worktrees/billing-02";

function step(over: Partial<Step>): Step {
  return { tier: "worker", issue: "billing-02", stage: "stage-1", skills: [], inputs: [], instruction: "x", worktree: WT, ...over };
}
function res(text: string): PiResult {
  return { text, stopReason: "stop", usage: { totalTokens: 1, cost: 0 } };
}
class SeqAgent implements AgentPort {
  constructor(private results: PiResult[]) {}
  run(_spec: RunSpec): Promise<PiResult> {
    const r = this.results.shift();
    if (!r) throw new Error("out of results");
    return Promise.resolve(r);
  }
}
class SeqGit implements GitPort {
  private n = 0;
  worktreeAdd(): Promise<string> { return Promise.reject(new Error("nope")); }
  commit(): Promise<string> { this.n++; return Promise.resolve(String(this.n).repeat(40).slice(0, 40)); }
  headSha(): Promise<string> { return Promise.resolve("0".repeat(40)); }
  diffStat(): Promise<string> { return Promise.resolve(""); }
}
class Recorder implements ProgressPort {
  events: ProgressEvent[] = [];
  emit(e: ProgressEvent): Promise<void> { this.events.push(e); return Promise.resolve(); }
  kinds(): string[] { return this.events.map((e) => e.kind); }
}

function workerStage(name: string): Stage {
  return {
    issue: "billing-02",
    stage: name,
    steps: [step({ tier: "worker", stage: name, commitMessage: `feat: ${name}` }), step({ tier: "verifier", stage: name })],
  };
}

describe("runIssue progress events", () => {
  test("emits stage-started, committed, verdict, stage-done, and done", async () => {
    const agent = new SeqAgent([res("impl"), res("VERDICT: PASS")]);
    const progress = new Recorder();
    const deps: RunStepDeps = { agent, git: new SeqGit(), progress };
    const issue: Issue = { issue: "billing-02", stages: [workerStage("stage-1")] };

    await runIssue(deps, issue);

    const kinds = progress.kinds();
    expect(kinds).toContain("stage-started");
    expect(kinds).toContain("committed");
    expect(kinds).toContain("verdict");
    expect(kinds).toContain("stage-done");
    expect(kinds).toContain("done");
  });

  test("a verdict event carries pass", async () => {
    const agent = new SeqAgent([res("impl"), res("VERDICT: PASS")]);
    const progress = new Recorder();
    await runIssue({ agent, git: new SeqGit(), progress }, { issue: "billing-02", stages: [workerStage("stage-1")] });

    const verdict = progress.events.find((e) => e.kind === "verdict");
    expect(verdict).toMatchObject({ kind: "verdict", verdict: "pass" });
  });

  test("emits a halted event when a stage fails verification", async () => {
    const agent = new SeqAgent([res("impl"), res("VERDICT: FAIL [plan]")]);
    const progress = new Recorder();
    await expect(
      runIssue({ agent, git: new SeqGit(), progress }, { issue: "billing-02", stages: [workerStage("stage-1")] }),
    ).rejects.toThrow();

    expect(progress.kinds()).toContain("halted");
  });

  test("works with no progress sink (back-compat)", async () => {
    const agent = new SeqAgent([res("impl"), res("VERDICT: PASS")]);
    const out = await runIssue({ agent, git: new SeqGit() }, { issue: "billing-02", stages: [workerStage("stage-1")] });
    expect(out.stages).toHaveLength(1);
  });

  test("emits a handoff event carrying the worker's summary after commit", async () => {
    const agent = new SeqAgent([res("Implemented the parser; deferred the CLI flag."), res("VERDICT: PASS")]);
    const progress = new Recorder();
    await runIssue({ agent, git: new SeqGit(), progress }, { issue: "billing-02", stages: [workerStage("stage-1")] });

    const handoff = progress.events.find((e) => e.kind === "handoff");
    expect(handoff).toBeDefined();
    expect(handoff).toMatchObject({ kind: "handoff", stage: "stage-1" });
    if (handoff && handoff.kind === "handoff") {
      expect(handoff.note).toContain("Implemented the parser");
    }
  });
});
