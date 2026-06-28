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

  test("the verifier instruction asks for a verdict against acceptance criteria", () => {
    const verifier = planToIssue(plan, config).stages[0]!.steps[1]!;
    expect(verifier.instruction.toLowerCase()).toMatch(/verif|verdict|acceptance/);
  });
});
