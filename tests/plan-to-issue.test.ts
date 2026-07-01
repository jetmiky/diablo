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
  ticketPaths: ["/proj/.scratch/onboarding-cleanup/01-cleanup.md"],
  skills: { designer: ["/skills/tdd/SKILL.md"], worker: ["/skills/tdd/SKILL.md"], verifier: [] },
};

describe("planToIssue", () => {
  test("maps the issue id and one Stage per plan stage, in order", () => {
    const issue = planToIssue(plan, config);
    expect(issue.issue).toBe("onboarding-cleanup");
    expect(issue.stages).toHaveLength(2);
    expect(issue.stages[0]!.stage).toBe("stage-1");
    expect(issue.stages[1]!.stage).toBe("stage-2");
  });

  test("each stage runs a design (planner-med), then worker, then verifier step", () => {
    const stage = planToIssue(plan, config).stages[0]!;
    expect(stage.steps.map((s) => s.tier)).toEqual(["planner-med", "worker", "verifier"]);
  });

  test("the design step does not commit (advisory note only) and the worker commits", () => {
    const [design, worker, verifier] = planToIssue(plan, config).stages[0]!.steps;
    expect(design!.commitMessage).toBeUndefined();
    expect(worker!.commitMessage).toBeDefined();
    expect(verifier!.commitMessage).toBeUndefined();
  });

  test("the design step writes a per-stage design note that the worker reads as input", () => {
    const [design, worker] = planToIssue(plan, config).stages[0]!.steps;
    const notePath = "/proj/.worktrees/onboarding-cleanup/.plans/onboarding-cleanup-stage-1-design.md";
    // the design step is told to write the note; the worker injects it as input
    expect(design!.instruction).toContain(notePath);
    expect(worker!.inputs).toContain(notePath);
  });

  test("the design step is told to read prior stages' committed code", () => {
    const design = planToIssue(plan, config).stages[1]!.steps[0]!;
    expect(design.instruction.toLowerCase()).toMatch(/prior|previous|committed|git/);
  });

  test("the design step names functions/types/files with signatures (TDD-consistent)", () => {
    const design = planToIssue(plan, config).stages[0]!.steps[0]!;
    const lower = design.instruction.toLowerCase();
    expect(lower).toMatch(/function|type|signature/);
    expect(lower).toMatch(/file/);
  });

  test("the design step loads the configured designer skills", () => {
    const design = planToIssue(plan, config).stages[0]!.steps[0]!;
    expect(design.skills).toContain("/skills/tdd/SKILL.md");
  });

  test("the worker step commits; the verifier step does not", () => {
    const [, worker, verifier] = planToIssue(plan, config).stages[0]!.steps;
    expect(worker!.commitMessage).toBeDefined();
    expect(verifier!.commitMessage).toBeUndefined();
  });

  test("worker commit message is a conventional commit referencing the stage", () => {
    const worker = planToIssue(plan, config).stages[1]!.steps.find((s) => s.tier === "worker")!;
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
    const worker = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "worker")!;
    expect(worker.skills).toContain("/skills/tdd/SKILL.md");
  });

  test("the worker instruction names the stage and its task ids", () => {
    const worker = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "worker")!;
    expect(worker.instruction).toContain("stage 1");
    expect(worker.instruction).toContain("T-001");
  });

  test("the worker instruction tells it to execute autonomously without asking for approval", () => {
    const worker = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "worker")!;
    // The TDD skill has interactive 'get user approval' checkpoints; a headless
    // worker must override them and implement directly, or it stalls waiting for
    // input that never comes. The human checkpoint is diablo's gate after commit.
    expect(worker.instruction.toLowerCase()).toMatch(/autonomous|do not ask|without asking|no approval/);
  });

  test("the verifier instruction asks for a verdict against acceptance criteria", () => {
    const verifier = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "verifier")!;
    expect(verifier.instruction.toLowerCase()).toMatch(/verif|verdict|acceptance/);
  });

  test("the verifier instruction requires running typecheck and the full test suite", () => {
    // The verdict must be grounded in actually executing the gates, not just
    // reading the diff — that is how a broken test file slips through.
    const verifier = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "verifier")!;
    const lower = verifier.instruction.toLowerCase();
    expect(lower).toMatch(/typecheck/);
    expect(lower).toMatch(/test/);
  });

  test("the verifier instruction mandates a final VERDICT: PASS or FAIL line", () => {
    // run-step parses this line to give the verdict teeth; without it the
    // verdict is read as 'none' and treated as a failure.
    const verifier = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "verifier")!;
    expect(verifier.instruction).toMatch(/VERDICT:\s*PASS/);
    expect(verifier.instruction).toMatch(/VERDICT:\s*FAIL/);
  });

  test("the verifier instruction asks for the FAIL category (implementation vs plan)", () => {
    // The category drives retry routing: [implementation] retries the worker,
    // [plan] halts to a human.
    const verifier = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "verifier")!;
    expect(verifier.instruction).toMatch(/\[implementation\]/);
    expect(verifier.instruction).toMatch(/\[plan\]/);
  });

  test("the verifier instruction treats an empty test suite as not-a-failure", () => {
    // In a TDD-staged plan a scaffold stage legitimately has no tests yet, and
    // `bun test` exits non-zero with "no tests found". That is NOT a stage
    // failure — only an actual failing/erroring test is. Without this the very
    // first stage can never pass.
    const verifier = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "verifier")!;
    expect(verifier.instruction.toLowerCase()).toMatch(/no tests|empty|not yet|absen/);
  });

  test("the per-stage verifier runs on the verifier tier (cheap, frequent)", () => {
    const verifier = planToIssue(plan, config).stages[0]!.steps.find((s) => s.tier === "verifier");
    expect(verifier).toBeDefined();
  });
});

describe("planToIssue gate wiring", () => {
  // The gate fires AFTER a verifier returns PASS (run-step's maybeGate runs once
  // the verdict is enforced), so the human approval checkpoint lands at each
  // stage's verification boundary — not before the work is judged.
  test("gate 'approval' puts the approval gate on the per-stage verifier", () => {
    const verifier = planToIssue(plan, { ...config, gate: "approval" })
      .stages[0]!.steps.find((s) => s.tier === "verifier")!;
    expect(verifier.gate).toBe("approval");
  });

  test("gate 'approval' leaves the design and worker steps AFK (gated only at verification)", () => {
    const [design, worker] = planToIssue(plan, { ...config, gate: "approval" }).stages[0]!.steps;
    // The worker runs unattended and is told not to ask for approval; only the
    // verifier (post-PASS) is where the human is consulted.
    expect(design!.gate).not.toBe("approval");
    expect(worker!.gate).not.toBe("approval");
  });

  test("gate 'approval' also gates the FINAL whole-feature verification step", () => {
    const verificationPlan: Plan = {
      stages: [
        plan.stages[0]!,
        { number: 2, title: "Verification", tasks: [{ ...plan.stages[0]!.tasks[0]!, id: "T-099" }] },
      ],
    };
    const finalVerify = planToIssue(verificationPlan, { ...config, gate: "approval" }).stages[1]!.steps[0]!;
    expect(finalVerify.gate).toBe("approval");
  });

  test("gate 'none' gates no step (fully AFK)", () => {
    for (const step of planToIssue(plan, { ...config, gate: "none" }).stages[0]!.steps) {
      expect(step.gate).not.toBe("approval");
    }
  });

  test("gate omitted defaults to AFK (back-compat: no approval gate)", () => {
    for (const step of planToIssue(plan, config).stages[0]!.steps) {
      expect(step.gate).not.toBe("approval");
    }
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

  test("a verification stage runs a single verification step, no worker", () => {
    const stage = planToIssue(verificationPlan, config).stages[1]!;
    expect(stage.steps).toHaveLength(1);
    expect(stage.steps[0]!.commitMessage).toBeUndefined();
  });

  test("the FINAL verification step runs on the PLANNER tier, not the per-stage verifier tier", () => {
    // Tier-mismatch fix: the final, whole-feature verification is a holistic
    // judgment and escalates to the planner (opus) tier; mid-pipeline verifiers
    // stay cheap on the verifier tier.
    const stage = planToIssue(verificationPlan, config).stages[1]!;
    expect(stage.steps[0]!.tier).toBe("planner-med");
  });

  test("the final verification step still enforces a verdict (verifies=true)", () => {
    const stage = planToIssue(verificationPlan, config).stages[1]!;
    expect(stage.steps[0]!.verifies).toBe(true);
    expect(stage.steps[0]!.instruction).toMatch(/VERDICT:\s*PASS/);
  });

  test("a verification stage's step never commits", () => {
    const stage = planToIssue(verificationPlan, config).stages[1]!;
    expect(stage.steps[0]!.commitMessage).toBeUndefined();
  });

  test("a verification stage's verifier names the stage and references the issue ticket", () => {
    const verifier = planToIssue(verificationPlan, config).stages[1]!.steps[0]!;
    expect(verifier.instruction).toContain("stage 2");
    expect(verifier.instruction.toLowerCase()).toContain("issue ticket");
  });

  test("non-verification stages are unaffected (design, worker, then verifier)", () => {
    const stage = planToIssue(verificationPlan, config).stages[0]!;
    expect(stage.steps.map((s) => s.tier)).toEqual(["planner-med", "worker", "verifier"]);
  });

  test("matches verification stages case-insensitively by title", () => {
    const lower: Plan = {
      stages: [{ ...verificationPlan.stages[1]!, title: "final verification & sign-off" }],
    };
    const stage = planToIssue(lower, config).stages[0]!;
    expect(stage.steps).toHaveLength(1);
    expect(stage.steps[0]!.tier).toBe("planner-med");
  });

  test("the final verification instruction requires a per-criterion CRITERIA checklist", () => {
    const finalVerify = planToIssue(verificationPlan, config).stages[1]!.steps[0]!;
    const instruction = finalVerify.instruction.toLowerCase();
    expect(instruction).toMatch(/criteria/i);
    expect(instruction).toMatch(/checkbox|checklist|\[x\]|\[ \]/i);
  });

  test("the final verification instruction requires citing concrete evidence for each criterion", () => {
    const finalVerify = planToIssue(verificationPlan, config).stages[1]!.steps[0]!;
    const instruction = finalVerify.instruction.toLowerCase();
    expect(instruction).toMatch(/evidence/i);
    expect(instruction).toMatch(/test name|code path|command output/i);
  });

  // --- issue #2 option A: the final verification stage carries a recoveryWorker
  // so a code-fixable FAIL [implementation] can route to a bounded worker retry
  // instead of halting unrecoverably after every per-stage verifier passed. ---

  test("the final verification stage carries a recoveryWorker (worker tier)", () => {
    const stage = planToIssue(verificationPlan, config).stages[1]!;
    expect(stage.recoveryWorker).toBeDefined();
    expect(stage.recoveryWorker!.tier).toBe("worker");
  });

  test("the recoveryWorker commits (its fix must land) and loads the worker skills", () => {
    const recovery = planToIssue(verificationPlan, config).stages[1]!.recoveryWorker!;
    expect(recovery.commitMessage).toBeDefined();
    expect(recovery.skills).toEqual(config.skills.worker);
  });

  test("the recoveryWorker is scoped to the relevant tasks' target files", () => {
    const recovery = planToIssue(verificationPlan, config).stages[1]!.recoveryWorker!;
    // T-002's target file is package.json in the fixture; the recovery worker
    // declares the union of the verification stage's tasks' target files.
    expect(recovery.targetFiles).toContain("package.json");
  });

  test("the recoveryWorker shares the worktree and reads the frozen plan", () => {
    const recovery = planToIssue(verificationPlan, config).stages[1]!.recoveryWorker!;
    expect(recovery.worktree).toBe(config.worktree);
    expect(recovery.inputs).toContain(config.planPath);
  });

  test("ordinary (non-verification) stages have no recoveryWorker (they recover via their inline worker)", () => {
    const stage = planToIssue(verificationPlan, config).stages[0]!;
    expect(stage.recoveryWorker).toBeUndefined();
  });
});
