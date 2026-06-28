import { describe, expect, test } from "bun:test";
import { buildPiArgs, sessionIdFor, type RunSpec } from "../src/domain/run-spec.ts";

const baseSpec: RunSpec = {
  tier: "worker",
  issue: "billing-02",
  stage: "stage-1",
  skills: ["/home/u/.agents/skills/tdd/SKILL.md"],
  inputs: ["./.diablo/billing-02/plan.md"],
  instruction: "Implement stage 1 following the plan and the TDD skill.",
  worktree: "/home/u/playground/proj/.worktrees/billing-02",
};

describe("buildPiArgs", () => {
  test("runs headless with JSON output", () => {
    const args = buildPiArgs(baseSpec);
    expect(args).toContain("-p");
    expect(args).toContain("--mode");
    expect(args[args.indexOf("--mode") + 1]).toBe("json");
  });

  test("maps the worker tier to sonnet at medium thinking", () => {
    const args = buildPiArgs(baseSpec);
    expect(args[args.indexOf("--model") + 1]).toBe("9router/kr/claude-sonnet-4.5:medium");
  });

  test("maps planner-high to opus at high thinking", () => {
    const args = buildPiArgs({ ...baseSpec, tier: "planner-high" });
    expect(args[args.indexOf("--model") + 1]).toBe("9router/kr/claude-opus-4.8:high");
  });

  test("maps planner-med to opus at medium thinking", () => {
    const args = buildPiArgs({ ...baseSpec, tier: "planner-med" });
    expect(args[args.indexOf("--model") + 1]).toBe("9router/kr/claude-opus-4.8:medium");
  });

  test("maps verifier to sonnet at medium thinking", () => {
    const args = buildPiArgs({ ...baseSpec, tier: "verifier" });
    expect(args[args.indexOf("--model") + 1]).toBe("9router/kr/claude-sonnet-4.5:medium");
  });

  test("uses a deterministic session-id of diablo-<issue>-<stage>-<role>", () => {
    const args = buildPiArgs(baseSpec);
    expect(args[args.indexOf("--session-id") + 1]).toBe("diablo-billing-02-stage-1-worker");
  });

  test("a runId is embedded in the session-id so runs do not collide", () => {
    // Pi resumes an existing --session-id (creating it only if missing), so a
    // session-id that is identical across runs makes a new run resume the old
    // transcript — the worker reads 'already done' and writes nothing. A per-run
    // runId keeps steps deterministic within a run but isolated across runs.
    const args = buildPiArgs({ ...baseSpec, runId: "r42" });
    expect(args[args.indexOf("--session-id") + 1]).toBe("diablo-billing-02-r42-stage-1-worker");
  });

  test("the same runId is stable across a run's steps but differs across runs", () => {
    const a = sessionIdFor({ ...baseSpec, runId: "r1" });
    const b = sessionIdFor({ ...baseSpec, runId: "r1" });
    const c = sessionIdFor({ ...baseSpec, runId: "r2" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test("never passes --continue (sessions are isolated, never resumed)", () => {
    const args = buildPiArgs(baseSpec);
    expect(args).not.toContain("--continue");
    expect(args).not.toContain("-c");
  });

  test("injects skills and inputs as @file references in the message, not via --skill", () => {
    const args = buildPiArgs(baseSpec);
    expect(args).not.toContain("--skill");
    expect(args).toContain("@/home/u/.agents/skills/tdd/SKILL.md");
    expect(args).toContain("@./.diablo/billing-02/plan.md");
  });

  test("places the instruction as the final positional argument, after all @files", () => {
    const args = buildPiArgs(baseSpec);
    expect(args[args.length - 1]).toBe(baseSpec.instruction);
    const lastAt = Math.max(...args.map((a, i) => (a.startsWith("@") ? i : -1)));
    expect(lastAt).toBeLessThan(args.length - 1);
  });

  test("orders @files as skills first, then inputs", () => {
    const args = buildPiArgs({
      ...baseSpec,
      skills: ["/s/a.md", "/s/b.md"],
      inputs: ["./i/x.md"],
    });
    const ats = args.filter((a) => a.startsWith("@"));
    expect(ats).toEqual(["@/s/a.md", "@/s/b.md", "@./i/x.md"]);
  });

  test("handles a step with no skills and no inputs", () => {
    const args = buildPiArgs({ ...baseSpec, skills: [], inputs: [] });
    expect(args.filter((a) => a.startsWith("@"))).toEqual([]);
    expect(args[args.length - 1]).toBe(baseSpec.instruction);
  });
});

describe("buildPiArgs model overrides", () => {
  // For cheap/toy runs the operator can override a tier's model without touching
  // the defaults. Overrides are per-tier; an unspecified tier keeps its default.
  test("an override replaces the model for the matching tier", () => {
    const args = buildPiArgs(baseSpec, {
      worker: { model: "claude-haiku-4.5", thinking: "medium" },
    });
    expect(args[args.indexOf("--model") + 1]).toBe("9router/kr/claude-haiku-4.5:medium");
  });

  test("an override for a different tier leaves this tier's default intact", () => {
    const args = buildPiArgs(baseSpec, {
      "planner-high": { model: "claude-sonnet-4.5", thinking: "high" },
    });
    expect(args[args.indexOf("--model") + 1]).toBe("9router/kr/claude-sonnet-4.5:medium");
  });

  test("overrides apply per tier across planner and worker", () => {
    const overrides = {
      "planner-high": { model: "claude-sonnet-4.5", thinking: "high" as const },
      worker: { model: "claude-haiku-4.5", thinking: "medium" as const },
    };
    const planner = buildPiArgs({ ...baseSpec, tier: "planner-high" }, overrides);
    const worker = buildPiArgs(baseSpec, overrides);
    expect(planner[planner.indexOf("--model") + 1]).toBe("9router/kr/claude-sonnet-4.5:high");
    expect(worker[worker.indexOf("--model") + 1]).toBe("9router/kr/claude-haiku-4.5:medium");
  });

  test("no overrides keeps every tier default", () => {
    expect(buildPiArgs(baseSpec)[buildPiArgs(baseSpec).indexOf("--model") + 1]).toBe(
      "9router/kr/claude-sonnet-4.5:medium",
    );
  });
});
