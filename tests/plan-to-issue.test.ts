import { describe, expect, test } from "bun:test";
import { planToIssue, type PlanToIssueConfig } from "../src/app/plan-to-issue.ts";
import type { Plan } from "../src/domain/plan.ts";

const plan: Plan = {
  stages: [
    {
      number: 1,
      title: "Telegram CLI Contract",
      tasks: [
        {
          id: "T-001",
          title: "Confirm init behavior",
          objective: "Lock init under test.",
          targetFiles: ["tests/cli/init.test.ts"],
          dependencies: [],
          acceptanceCriteria: ["legacy flag fails"],
        },
      ],
    },
    {
      number: 2,
      title: "Docs and Migration",
      tasks: [
        {
          id: "T-002",
          title: "Update README",
          objective: "Replace stale flags.",
          targetFiles: ["README.md"],
          dependencies: ["T-001"],
          acceptanceCriteria: ["README uses defaults-mode"],
        },
      ],
    },
  ],
};

const config: PlanToIssueConfig = {
  issue: "onboarding-cleanup",
  worktree: "/proj/.worktrees/onboarding-cleanup",
  planPath: "/proj/.plans/onboarding-cleanup-plan.md",
  skills: { worker: ["/skills/tdd/SKILL.md"], verifier: [] },
};

describe("planToIssue", () => {
  test("maps the issue id and one Stage per plan stage, in order", () => {
    const issue = planToIssue(plan, config);
    expect(issue.issue).toBe("onboarding-cleanup");
    expect(issue.stages).toHaveLength(2);
    expect(issue.stages[0]!.stage).toBe("stage-1");
    expect(issue.stages[1]!.stage).toBe("stage-2");
  });

  test("each stage runs a worker step then a verifier step", () => {
    const stage = planToIssue(plan, config).stages[0]!;
    expect(stage.steps.map((s) => s.tier)).toEqual(["worker", "verifier"]);
  });

  test("the worker step commits; the verifier step does not", () => {
    const [worker, verifier] = planToIssue(plan, config).stages[0]!.steps;
    expect(worker!.commitMessage).toBeDefined();
    expect(verifier!.commitMessage).toBeUndefined();
  });

  test("worker commit message is a conventional commit referencing the stage", () => {
    const worker = planToIssue(plan, config).stages[1]!.steps[0]!;
    expect(worker.commitMessage).toMatch(/^feat\(onboarding-cleanup\): stage 2/i);
  });

  test("every step shares the issue's worktree", () => {
    for (const stage of planToIssue(plan, config).stages) {
      for (const step of stage.steps) {
        expect(step.worktree).toBe("/proj/.worktrees/onboarding-cleanup");
      }
    }
  });

  test("the plan file is injected as an input to every step", () => {
    for (const stage of planToIssue(plan, config).stages) {
      for (const step of stage.steps) {
        expect(step.inputs).toContain("/proj/.plans/onboarding-cleanup-plan.md");
      }
    }
  });

  test("the worker step loads the configured worker skills", () => {
    const worker = planToIssue(plan, config).stages[0]!.steps[0]!;
    expect(worker.skills).toContain("/skills/tdd/SKILL.md");
  });

  test("the worker instruction names the stage and its task ids", () => {
    const worker = planToIssue(plan, config).stages[0]!.steps[0]!;
    expect(worker.instruction).toContain("stage 1");
    expect(worker.instruction).toContain("T-001");
  });

  test("the worker instruction tells it to execute autonomously without asking for approval", () => {
    const worker = planToIssue(plan, config).stages[0]!.steps[0]!;
    // The TDD skill has interactive 'get user approval' checkpoints; a headless
    // worker must override them and implement directly, or it stalls waiting for
    // input that never comes. The human checkpoint is diablo's gate after commit.
    expect(worker.instruction.toLowerCase()).toMatch(/autonomous|do not ask|without asking|no approval/);
  });

  test("the verifier instruction asks for a verdict against acceptance criteria", () => {
    const verifier = planToIssue(plan, config).stages[0]!.steps[1]!;
    expect(verifier.instruction.toLowerCase()).toMatch(/verif|verdict|acceptance/);
  });

  test("the verifier instruction requires running typecheck and the full test suite", () => {
    // The verdict must be grounded in actually executing the gates, not just
    // reading the diff — that is how a broken test file slips through.
    const verifier = planToIssue(plan, config).stages[0]!.steps[1]!;
    const lower = verifier.instruction.toLowerCase();
    expect(lower).toMatch(/typecheck/);
    expect(lower).toMatch(/test/);
  });

  test("the verifier instruction mandates a final VERDICT: PASS or FAIL line", () => {
    // run-step parses this line to give the verdict teeth; without it the
    // verdict is read as 'none' and treated as a failure.
    const verifier = planToIssue(plan, config).stages[0]!.steps[1]!;
    expect(verifier.instruction).toMatch(/VERDICT:\s*PASS/);
    expect(verifier.instruction).toMatch(/VERDICT:\s*FAIL/);
  });
});

describe("planToIssue verification stages", () => {
  // A stage whose purpose is verification (the master-plan skill titles the
  // final gate "Verification") produces no NEW artifacts — its tests were
  // already written in earlier TDD worker stages. Giving it a committing worker
  // makes the worker find nothing to commit and crashes the pipeline on
  // "nothing to commit". Such a stage must map to a verifier-only step.
  const verificationPlan: Plan = {
    stages: [
      {
        number: 1,
        title: "Core logic",
        tasks: [
          {
            id: "T-001",
            title: "Implement it",
            objective: "Build the thing.",
            targetFiles: ["src/thing.ts"],
            dependencies: [],
            acceptanceCriteria: ["it works"],
          },
        ],
      },
      {
        number: 2,
        title: "Verification",
        tasks: [
          {
            id: "T-002",
            title: "Typecheck & test gate",
            objective: "Confirm the project typechecks and tests pass.",
            targetFiles: ["package.json"],
            dependencies: ["T-001"],
            acceptanceCriteria: ["bun run typecheck passes", "bun test passes"],
          },
        ],
      },
    ],
  };

  test("a verification stage runs a single verifier step, no worker", () => {
    const stage = planToIssue(verificationPlan, config).stages[1]!;
    expect(stage.steps.map((s) => s.tier)).toEqual(["verifier"]);
  });

  test("a verification stage's step never commits", () => {
    const stage = planToIssue(verificationPlan, config).stages[1]!;
    expect(stage.steps[0]!.commitMessage).toBeUndefined();
  });

  test("a verification stage's verifier names the stage and its task ids", () => {
    const verifier = planToIssue(verificationPlan, config).stages[1]!.steps[0]!;
    expect(verifier.instruction).toContain("stage 2");
    expect(verifier.instruction).toContain("T-002");
  });

  test("non-verification stages are unaffected (still worker then verifier)", () => {
    const stage = planToIssue(verificationPlan, config).stages[0]!;
    expect(stage.steps.map((s) => s.tier)).toEqual(["worker", "verifier"]);
  });

  test("matches verification stages case-insensitively by title", () => {
    const lower: Plan = {
      stages: [{ ...verificationPlan.stages[1]!, title: "final verification & sign-off" }],
    };
    const stage = planToIssue(lower, config).stages[0]!;
    expect(stage.steps.map((s) => s.tier)).toEqual(["verifier"]);
  });
});
