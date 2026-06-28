import { describe, expect, test } from "bun:test";
import { loadIssue, type LoadIssueConfig, type LoadIssueDeps } from "../src/app/load-issue.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import type { GitPort } from "../src/ports/git.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { PiResult } from "../src/domain/pi-result.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";

const PLAN = `## Stages

### Stage 1 - First
[T-001] - Do a thing
- Objective: do it
- Target Files: src/a.ts
- Dependency: None
- Acceptance Criterias:
  - it works
`;

const config: LoadIssueConfig = {
  issue: "billing-02",
  worktree: "/proj/.worktrees/billing-02",
  ticketPaths: ["/proj/.scratch/billing-02/01-fix.md"],
  planPath: "/proj/.worktrees/billing-02/.plans/billing-02-plan.md",
  skills: {
    planner: ["/skills/master-plan/SKILL.md"],
    designer: ["/skills/tdd/SKILL.md"],
    worker: ["/skills/tdd/SKILL.md"],
    verifier: [],
  },
};

// In-memory fs seeded with optional initial files.
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

// Agent that records its calls and, on run, simulates the planner writing the
// plan file (what the real master-plan-driven planner does via its write tool).
class FakeAgent implements AgentPort {
  calls: RunSpec[] = [];
  constructor(private onRun?: () => void) {}
  run(spec: RunSpec): Promise<PiResult> {
    this.calls.push(spec);
    this.onRun?.();
    return Promise.resolve({ text: "plan written", stopReason: "stop", usage: { totalTokens: 1, cost: 0 } });
  }
}

class FakeGit implements GitPort {
  worktreeAdd(): Promise<string> {
    return Promise.resolve(config.worktree);
  }
  commit(): Promise<string> {
    return Promise.resolve("p".repeat(40));
  }
  headSha(): Promise<string> {
    return Promise.resolve("p".repeat(40));
  }
  diffStat(): Promise<string> {
    return Promise.resolve("");
  }
}

function deps(agent: AgentPort, fs: FsPort): LoadIssueDeps {
  return { agent, git: new FakeGit(), fs };
}

describe("loadIssue", () => {
  test("fresh: runs a planner step that writes the plan, then returns the mapped issue", async () => {
    const fs = new FakeFs(); // no plan yet
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    const issue = await loadIssue(deps(agent, fs), config);

    expect(agent.calls).toHaveLength(1);
    expect(agent.calls[0]!.tier).toBe("planner-high");
    expect(issue.issue).toBe("billing-02");
    expect(issue.stages).toHaveLength(1);
    expect(issue.stages[0]!.steps.map((s) => s.tier)).toEqual(["planner-med", "worker", "verifier"]);
  });

  test("fresh: the planner step injects the master-plan skill and the ticket(s)", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(() => fs.write(config.planPath, PLAN));
    await loadIssue(deps(agent, fs), config);

    const spec = agent.calls[0]!;
    expect(spec.skills).toContain("/skills/master-plan/SKILL.md");
    expect(spec.inputs).toContain("/proj/.scratch/billing-02/01-fix.md");
  });

  test("resume: when the plan already exists, does NOT run the planner", async () => {
    const fs = new FakeFs({ [config.planPath]: PLAN });
    const agent = new FakeAgent();
    const issue = await loadIssue(deps(agent, fs), config);

    expect(agent.calls).toHaveLength(0); // reused the frozen plan
    expect(issue.stages).toHaveLength(1);
  });

  test("the mapped worker steps reference the frozen plan path as an input", async () => {
    const fs = new FakeFs({ [config.planPath]: PLAN });
    const agent = new FakeAgent();
    const issue = await loadIssue(deps(agent, fs), config);

    expect(issue.stages[0]!.steps[0]!.inputs).toContain(config.planPath);
  });

  test("throws a clear error if the planner ran but no plan file appeared", async () => {
    const fs = new FakeFs();
    const agent = new FakeAgent(); // does NOT write the plan
    await expect(loadIssue(deps(agent, fs), config)).rejects.toThrow(/plan.*not.*(written|found|exist)/i);
  });
});
