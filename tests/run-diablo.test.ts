import { describe, expect, test } from "bun:test";
import { runDiablo, type RunDiabloConfig, type RunDiabloDeps } from "../src/app/run-diablo.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { GitPort } from "../src/ports/git.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PiResult } from "../src/domain/pi-result.ts";
import { GateDeclinedError, type GatePort, type GateRequest } from "../src/ports/gate.ts";

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
  skills: { planner: ["/s/master-plan/SKILL.md"], designer: ["/s/tdd/SKILL.md"], worker: ["/s/tdd/SKILL.md"], verifier: [] },
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
    if (spec.tier === "architect") this.onPlan?.();
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
    expect(agent.tiers[0]).toBe("architect");
    expect(agent.tiers.slice(1)).toEqual(["planner", "worker", "verifier"]); // the stage ran
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

    expect(agent.tiers).toEqual(["planner", "worker", "verifier"]); // planner skipped
  });

  test("writes a self-ignoring .plans/.gitignore so machine artifacts never commit", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    await runDiablo(deps(agent, new FakeGit(), fs), config);

    const ignore = fs.files.get("/proj/.worktrees/billing-02/.plans/.gitignore");
    expect(ignore?.trim()).toBe("*");
  });

  test("retrofits the artifact ignore even when the worktree already exists (resume)", async () => {
    const fs = new FakeFs({ [config.planPath]: PLAN });
    fs.dirs.add(config.worktree);
    await runDiablo(deps(new FakeAgent(), new FakeGit(), fs), config);

    expect(fs.files.get("/proj/.worktrees/billing-02/.plans/.gitignore")?.trim()).toBe("*");
  });
});

describe("runDiablo integration", () => {
  const intConfig = {
    ...config,
    integration: { targetBranch: "main", branchPrefix: "diablo/", autoMerge: false },
  };

  test("passes the prefixed branch name to worktreeAdd", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    const git = new FakeGit();
    const branches: Array<string | undefined> = [];
    const trackingGit: GitPort = {
      worktreeAdd: (issue, base, branch) => {
        branches.push(branch);
        return git.worktreeAdd(issue, base);
      },
      commit: () => git.commit(),
      headSha: () => git.headSha(),
      diffStat: () => git.diffStat(),
    };
    await runDiablo({ agent, git: trackingGit, fs }, { ...intConfig, integration: { targetBranch: "main", branchPrefix: "feat/diablo-", autoMerge: false } });
    expect(branches).toEqual(["feat/diablo-billing-02"]);
  });

  test("autoMerge off: returns a manual integration result, never merges", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    let merged = false;
    const merge = { merge: () => { merged = true; return Promise.resolve({ ok: true as const }); } };
    const out = await runDiablo({ agent, git: new FakeGit(), fs, merge }, intConfig);

    expect(out.integration?.status).toBe("manual");
    expect(merged).toBe(false);
  });

  test("autoMerge on + clean: merges into the target branch", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    const mergeCalls: Array<{ target: string; branch: string }> = [];
    const merge = {
      merge: (target: string, branch: string) => {
        mergeCalls.push({ target, branch });
        return Promise.resolve({ ok: true as const });
      },
    };
    const out = await runDiablo(
      { agent, git: new FakeGit(), fs, merge },
      { ...intConfig, integration: { targetBranch: "main", branchPrefix: "diablo/", autoMerge: true } },
    );

    expect(out.integration?.status).toBe("merged");
    expect(mergeCalls).toEqual([{ target: "main", branch: "diablo/billing-02" }]);
  });

  test("no integration config: no integration result (back-compat)", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    const out = await runDiablo(deps(agent, new FakeGit(), fs), config);
    expect(out.integration).toBeUndefined();
  });
});

describe("runDiablo gate wiring", () => {
  class FakeGate implements GatePort {
    requests: GateRequest[] = [];
    constructor(private decision: boolean) {}
    confirm(request: GateRequest): Promise<boolean> {
      this.requests.push(request);
      return Promise.resolve(this.decision);
    }
  }

  test("gate 'approval' consults the GatePort at the verifier (post-PASS)", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    const gate = new FakeGate(true);
    await runDiablo({ agent, git: new FakeGit(), fs, gate }, { ...config, gate: "approval" });

    // Exactly the verifier step is gated; design and worker run AFK.
    expect(gate.requests.map((r) => r.tier)).toEqual(["verifier"]);
    expect(gate.requests[0]!.stage).toBe("stage-1");
  });

  test("gate 'none' never consults the GatePort (fully AFK)", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    const gate = new FakeGate(false); // would decline if ever asked
    const out = await runDiablo({ agent, git: new FakeGit(), fs, gate }, { ...config, gate: "none" });

    expect(gate.requests).toHaveLength(0);
    expect(out.commit).toBe("c".repeat(40));
  });

  test("declining the gate halts the run with GateDeclinedError", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    const gate = new FakeGate(false);
    await expect(
      runDiablo({ agent, git: new FakeGit(), fs, gate }, { ...config, gate: "approval" }),
    ).rejects.toBeInstanceOf(GateDeclinedError);
  });
});
