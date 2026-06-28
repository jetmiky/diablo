import { describe, expect, test } from "bun:test";
import { runDiablo, type RunDiabloConfig, type RunDiabloDeps } from "../src/app/run-diablo.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { GitPort } from "../src/ports/git.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PiResult } from "../src/domain/pi-result.ts";

const PLAN = `## Stages

### Stage 1 - First
[T-001] - Do a thing
- Objective: do it
- Target Files: src/a.ts
- Dependency: None
- Acceptance Criterias:
  - it works
`;

const config: RunDiabloConfig = {
  issue: "billing-02",
  baseBranch: "main",
  worktree: "/proj/.worktrees/billing-02",
  ticketPaths: ["/proj/.scratch/billing-02/01.md"],
  planPath: "/proj/.worktrees/billing-02/.plans/billing-02-plan.md",
  skills: { planner: ["/s/master-plan/SKILL.md"], worker: ["/s/tdd/SKILL.md"], verifier: [] },
};

class FakeFs implements FsPort {
  files = new Map<string, string>();
  dirs = new Set<string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }
  read(p: string): Promise<string> {
    const v = this.files.get(p);
    return v === undefined ? Promise.reject(new Error(`ENOENT ${p}`)) : Promise.resolve(v);
  }
  write(p: string, c: string): Promise<void> {
    this.files.set(p, c);
    return Promise.resolve();
  }
  exists(p: string): Promise<boolean> {
    return Promise.resolve(this.files.has(p) || this.dirs.has(p));
  }
}

class FakeAgent implements AgentPort {
  tiers: string[] = [];
  constructor(private onPlan?: () => void) {}
  run(spec: { tier: string }): Promise<PiResult> {
    this.tiers.push(spec.tier);
    if (spec.tier === "planner-high") this.onPlan?.();
    const text = spec.tier === "verifier" ? "VERDICT: PASS" : "ok";
    return Promise.resolve({ text, stopReason: "stop", usage: { totalTokens: 1, cost: 0 } });
  }
}

class FakeGit implements GitPort {
  worktreesAdded: string[] = [];
  worktreeAdd(issue: string): Promise<string> {
    this.worktreesAdded.push(issue);
    return Promise.resolve(config.worktree);
  }
  commit(): Promise<string> {
    return Promise.resolve("c".repeat(40));
  }
  headSha(): Promise<string> {
    return Promise.resolve("c".repeat(40));
  }
  diffStat(): Promise<string> {
    return Promise.resolve("");
  }
}

function deps(agent: AgentPort, git: FakeGit, fs: FsPort): RunDiabloDeps {
  return { agent, git, fs };
}

describe("runDiablo", () => {
  test("fresh: creates the worktree, generates the plan, runs the issue", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    const git = new FakeGit();
    const result = await runDiablo(deps(agent, git, fs), config);

    expect(git.worktreesAdded).toEqual(["billing-02"]);
    expect(agent.tiers[0]).toBe("planner-high");
    expect(agent.tiers.slice(1)).toEqual(["worker", "verifier"]); // the stage ran
    expect(result.commit).toBe("c".repeat(40));
  });

  test("resume: when the worktree already exists, does not re-add it", async () => {
    const fs = new FakeFs({ [config.planPath]: PLAN });
    fs.dirs.add(config.worktree);
    const git = new FakeGit();
    await runDiablo(deps(new FakeAgent(), git, fs), config);

    expect(git.worktreesAdded).toEqual([]); // reused existing worktree
  });

  test("resume: an existing frozen plan is reused (no planner run)", async () => {
    const fs = new FakeFs({ [config.planPath]: PLAN });
    fs.dirs.add(config.worktree);
    const agent = new FakeAgent();
    await runDiablo(deps(agent, new FakeGit(), fs), config);

    expect(agent.tiers).toEqual(["worker", "verifier"]); // planner skipped
  });
});
