import { describe, expect, test } from "bun:test";
import { runStep, VerificationFailedError, StepTimeoutError, type RunStepDeps, type Step } from "../src/app/run-step.ts";
import { RunBudget, RunBudgetExceededError } from "../src/domain/run-budget.ts";
import type { AgentPort } from "../src/ports/agent.ts";
import { NoChangesToCommitError, type GitPort } from "../src/ports/git.ts";
import type { ProgressEvent } from "../src/ports/progress.ts";
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
  committed: string[] = [];
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
  committedFiles(): Promise<string[]> {
    return Promise.resolve(this.committed);
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
      committedFiles: (w, s) => git.committedFiles(w, s),
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

  test("a worker that produced no changes defers to the verifier (no commit, no throw)", async () => {
    // A stage whose scope an earlier stage already satisfied has nothing new to
    // commit. That must not abort the pipeline — return without a commit SHA and
    // let the verifier judge whether the stage is satisfied.
    const agent = new FakeAgent(fakeResult({ text: "nothing left to do" }));
    const noChangeGit: GitPort = {
      worktreeAdd: () => Promise.reject(new Error("not used")),
      commit: () => Promise.reject(new NoChangesToCommitError("/proj/.worktrees/billing-02")),
      headSha: () => Promise.resolve("a".repeat(40)),
      diffStat: () => Promise.resolve(""),
      committedFiles: () => Promise.resolve([]),
    };
    const result = await runStep(deps(agent, noChangeGit), baseStep);
    expect(result.commit).toBeUndefined();
    expect(result.text).toBe("nothing left to do");
  });

  test("a non-NoChanges git error during commit still propagates", async () => {
    const agent = new FakeAgent(fakeResult());
    const brokenGit: GitPort = {
      worktreeAdd: () => Promise.reject(new Error("not used")),
      commit: () => Promise.reject(new Error("git index locked")),
      headSha: () => Promise.resolve("a".repeat(40)),
      diffStat: () => Promise.resolve(""),
      committedFiles: () => Promise.resolve([]),
    };
    await expect(runStep(deps(agent, brokenGit), baseStep)).rejects.toThrow(/index locked/);
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

describe("runStep commit-scope warning", () => {
  const scopedStep: Step = {
    ...baseStep,
    targetFiles: ["src/a.ts", "src/b.ts"],
  };

  function depsWithProgress(agent: AgentPort, git: GitPort, events: ProgressEvent[]): RunStepDeps {
    return { agent, git, progress: { emit: (e) => { events.push(e); return Promise.resolve(); } } };
  }

  test("emits a scope-warning naming files committed outside the declared targets", async () => {
    const git = new FakeGit();
    git.committed = ["src/a.ts", "src/sneaky.ts"];
    const events: ProgressEvent[] = [];
    await runStep(depsWithProgress(new FakeAgent(fakeResult()), git, events), scopedStep);

    const warn = events.find((e) => e.kind === "scope-warning");
    expect(warn).toBeDefined();
    expect((warn as { files: string[] }).files).toEqual(["src/sneaky.ts"]);
  });

  test("does NOT warn when every committed file is a declared target", async () => {
    const git = new FakeGit();
    git.committed = ["src/a.ts", "src/b.ts"];
    const events: ProgressEvent[] = [];
    await runStep(depsWithProgress(new FakeAgent(fakeResult()), git, events), scopedStep);

    expect(events.find((e) => e.kind === "scope-warning")).toBeUndefined();
  });

  test("does NOT warn for committed test files (TDD pairing is in scope)", async () => {
    const git = new FakeGit();
    git.committed = ["src/a.ts", "tests/a.test.ts"];
    const events: ProgressEvent[] = [];
    await runStep(depsWithProgress(new FakeAgent(fakeResult()), git, events), scopedStep);

    expect(events.find((e) => e.kind === "scope-warning")).toBeUndefined();
  });

  test("a step with no targetFiles never checks scope (committedFiles not called)", async () => {
    let called = false;
    const git = new FakeGit();
    const tracking: GitPort = {
      worktreeAdd: (i, b) => git.worktreeAdd(i, b),
      commit: (w, m) => git.commit(w, m),
      headSha: (w) => git.headSha(w),
      diffStat: (w, b) => git.diffStat(w, b),
      committedFiles: (w, s) => { called = true; return git.committedFiles(w, s); },
    };
    const events: ProgressEvent[] = [];
    await runStep(depsWithProgress(new FakeAgent(fakeResult()), tracking, events), baseStep);

    expect(called).toBe(false);
    expect(events.find((e) => e.kind === "scope-warning")).toBeUndefined();
  });

  test("a failure reading committed files never breaks the step (advisory only)", async () => {
    const git = new FakeGit();
    const tracking: GitPort = {
      worktreeAdd: (i, b) => git.worktreeAdd(i, b),
      commit: (w, m) => git.commit(w, m),
      headSha: (w) => git.headSha(w),
      diffStat: (w, b) => git.diffStat(w, b),
      committedFiles: () => Promise.reject(new Error("diff-tree blew up")),
    };
    const result = await runStep(deps(new FakeAgent(fakeResult()), tracking), scopedStep);
    expect(result.commit).toBe("a".repeat(40)); // step still succeeds
  });
});

describe("runStep step timeout / kill", () => {
  // A controllable deadline: records start/stop and lets the test fire expiry by
  // hand, so the timeout path is exercised without any real timer.
  class FakeDeadline {
    started = false;
    stopped = false;
    private onExpire?: () => void;
    constructor(onExpire: () => void) {
      this.onExpire = onExpire;
    }
    start(): void {
      this.started = true;
    }
    stop(): void {
      this.stopped = true;
    }
    fire(): void {
      this.onExpire?.();
    }
  }

  // An agent that never settles on its own — only when its abort signal fires.
  function abortableAgent(seen: { signal?: AbortSignal }): AgentPort {
    return {
      run: (_spec, _onActivity, signal) => {
        seen.signal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("process killed")));
        });
      },
    };
  }

  test("fires the deadline → aborts the agent and throws StepTimeoutError", async () => {
    const seen: { signal?: AbortSignal } = {};
    let deadline: FakeDeadline | undefined;
    const promise = runStep(
      {
        agent: abortableAgent(seen),
        git: new FakeGit(),
        deadline: (onExpire) => (deadline = new FakeDeadline(onExpire)),
      },
      baseStep,
    );
    deadline!.fire(); // simulate the step timing out
    await expect(promise).rejects.toBeInstanceOf(StepTimeoutError);
    expect(seen.signal?.aborted).toBe(true); // the process was signalled to die
    expect(deadline!.started).toBe(true);
    expect(deadline!.stopped).toBe(true); // deadline cleaned up
  });

  test("the StepTimeoutError names the issue and stage", async () => {
    const seen: { signal?: AbortSignal } = {};
    let deadline: FakeDeadline | undefined;
    const promise = runStep(
      { agent: abortableAgent(seen), git: new FakeGit(), deadline: (oe) => (deadline = new FakeDeadline(oe)) },
      baseStep,
    );
    deadline!.fire();
    await expect(promise).rejects.toThrow(/billing-02.*stage-1|stage-1.*billing-02/s);
  });

  test("a step that finishes before the deadline does not time out, and stops the deadline", async () => {
    let deadline: FakeDeadline | undefined;
    const result = await runStep(
      {
        agent: new FakeAgent(fakeResult()),
        git: new FakeGit(),
        deadline: (onExpire) => (deadline = new FakeDeadline(onExpire)),
      },
      baseStep,
    );
    expect(result.commit).toBe("a".repeat(40));
    expect(deadline!.stopped).toBe(true); // cleaned up even on the happy path
  });
});

describe("runStep run budget", () => {
  test("checks the budget before running the agent; a breach throws and the agent never runs", async () => {
    let ran = false;
    const agent: AgentPort = { run: () => { ran = true; return Promise.resolve(fakeResult()); } };
    const budget = { check: () => { throw new RunBudgetExceededError("step count 5 exceeds maxSteps 4"); } };
    await expect(runStep({ agent, git: new FakeGit(), budget }, baseStep)).rejects.toBeInstanceOf(
      RunBudgetExceededError,
    );
    expect(ran).toBe(false); // budget gates the step BEFORE the agent runs
  });

  test("a within-budget step runs normally", async () => {
    const budget = new RunBudget({ runBudgetMs: 1_000_000, maxSteps: 100 }, () => 0);
    const result = await runStep({ agent: new FakeAgent(fakeResult()), git: new FakeGit(), budget }, baseStep);
    expect(result.commit).toBe("a".repeat(40));
  });
});

describe("runStep heartbeat wiring", () => {
  // A controllable heartbeat: records start/stop and lets the test fire a tick
  // by hand, so we assert the ticker brackets the in-flight agent call without
  // any real timer.
  class FakeHeartbeat {
    started = false;
    stopped = false;
    private onTick?: (elapsedMs: number) => void;
    constructor(onTick: (elapsedMs: number) => void) {
      this.onTick = onTick;
    }
    start(): void {
      this.started = true;
    }
    stop(): void {
      this.stopped = true;
    }
    tick(elapsedMs: number): void {
      this.onTick?.(elapsedMs);
    }
  }

  test("starts a heartbeat before the agent runs and stops it after", async () => {
    const order: string[] = [];
    let beat: FakeHeartbeat | undefined;
    const agent = new FakeAgent(() => {
      order.push("agent");
      return Promise.resolve(fakeResult());
    });
    const d: RunStepDeps = {
      agent,
      git: new FakeGit(),
      heartbeat: (onTick) => {
        beat = new FakeHeartbeat(onTick);
        const original = beat.start.bind(beat);
        beat.start = () => {
          order.push("start");
          original();
        };
        const originalStop = beat.stop.bind(beat);
        beat.stop = () => {
          order.push("stop");
          originalStop();
        };
        return beat;
      },
    };

    await runStep(d, baseStep);

    expect(order).toEqual(["start", "agent", "stop"]);
    expect(beat!.started).toBe(true);
    expect(beat!.stopped).toBe(true);
  });

  test("a heartbeat tick emits a heartbeat progress event for the step's stage", async () => {
    const events: Array<{ kind: string; stage?: string; elapsedMs?: number }> = [];
    let beat: FakeHeartbeat | undefined;
    const agent = new FakeAgent(async () => {
      beat!.tick(42_000); // a tick arrives while the agent is in flight
      return fakeResult();
    });
    const d: RunStepDeps = {
      agent,
      git: new FakeGit(),
      progress: { emit: (e) => { events.push(e); return Promise.resolve(); } },
      heartbeat: (onTick) => (beat = new FakeHeartbeat(onTick)),
    };

    await runStep(d, baseStep);

    const hb = events.find((e) => e.kind === "heartbeat");
    expect(hb).toBeDefined();
    expect(hb!.stage).toBe("stage-1");
    expect(hb!.elapsedMs).toBe(42_000);
  });

  test("stops the heartbeat even when the agent run fails", async () => {
    let beat: FakeHeartbeat | undefined;
    const agent = new FakeAgent(() => Promise.reject(new Error("pi exited with code 1")));
    const d: RunStepDeps = {
      agent,
      git: new FakeGit(),
      heartbeat: (onTick) => (beat = new FakeHeartbeat(onTick)),
    };

    await expect(runStep(d, baseStep)).rejects.toThrow(/code 1/);
    expect(beat!.stopped).toBe(true);
  });

  test("a heartbeat tick carries the latest agent activity label", async () => {
    const events: Array<{ kind: string; activity?: string }> = [];
    let beat: FakeHeartbeat | undefined;
    // An agent that reports activity, THEN a tick fires, then reports again,
    // then another tick — so we prove the heartbeat reflects the most recent.
    const agent: AgentPort = {
      run: (_spec, onActivity) => {
        onActivity?.("reading run-step.ts");
        beat!.tick(1_000);
        onActivity?.("running `bun test`");
        beat!.tick(2_000);
        return Promise.resolve(fakeResult());
      },
    };
    const d: RunStepDeps = {
      agent,
      git: new FakeGit(),
      progress: { emit: (e) => { events.push(e); return Promise.resolve(); } },
      heartbeat: (onTick) => (beat = new FakeHeartbeat(onTick)),
    };

    await runStep(d, baseStep);

    const hbs = events.filter((e) => e.kind === "heartbeat");
    expect(hbs).toHaveLength(2);
    expect(hbs[0]!.activity).toBe("reading run-step.ts");
    expect(hbs[1]!.activity).toBe("running `bun test`");
  });

  test("a heartbeat tick before any activity has no activity label", async () => {
    const events: Array<{ kind: string; activity?: string }> = [];
    let beat: FakeHeartbeat | undefined;
    const agent: AgentPort = {
      run: () => {
        beat!.tick(500); // tick before the agent reports any tool use
        return Promise.resolve(fakeResult());
      },
    };
    const d: RunStepDeps = {
      agent,
      git: new FakeGit(),
      progress: { emit: (e) => { events.push(e); return Promise.resolve(); } },
      heartbeat: (onTick) => (beat = new FakeHeartbeat(onTick)),
    };

    await runStep(d, baseStep);

    const hb = events.find((e) => e.kind === "heartbeat");
    expect(hb).toBeDefined();
    expect(hb!.activity).toBeUndefined();
  });
});
