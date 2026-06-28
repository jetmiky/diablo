import { describe, expect, test } from "bun:test";
import { parsePlan } from "../src/domain/plan.ts";

// Mirrors the master-plan skill's frozen-plan format exactly.
const samplePlan = `# Onboarding Init Cleanup - Plan

Some intro prose that the parser should ignore.

## Stages

### Stage 1 - Telegram CLI Contract

[T-001] - Confirm current init behavior
- Objective: Lock existing init behavior under test before changing it.
- Target Files: tests/cli/init.test.ts
- Dependency: None
- Acceptance Criterias:
  - Legacy --telegram flag still fails with guidance
  - init scaffolds omit telegram config

[T-002] - Add telegram setup routing
- Objective: Route \`albedo telegram setup\` to a handler.
- Target Files: src/cli/cli.ts, src/cli/commands/telegram-setup.ts
- Dependency: T-001
- Acceptance Criterias:
  - Help documents the command

### Stage 2 - Docs and Migration

[T-003] - Update README quick start
- Objective: Replace stale init flags in the README.
- Target Files: README.md
- Dependency: T-001 , T-002
- Acceptance Criterias:
  - README uses defaults-mode init
`;

describe("parsePlan", () => {
  test("parses stages with titles and 1-based numbers", () => {
    const plan = parsePlan(samplePlan);
    expect(plan.stages).toHaveLength(2);
    expect(plan.stages[0]!.number).toBe(1);
    expect(plan.stages[0]!.title).toBe("Telegram CLI Contract");
    expect(plan.stages[1]!.number).toBe(2);
    expect(plan.stages[1]!.title).toBe("Docs and Migration");
  });

  test("assigns tasks to the stage they appear under", () => {
    const plan = parsePlan(samplePlan);
    expect(plan.stages[0]!.tasks.map((t) => t.id)).toEqual(["T-001", "T-002"]);
    expect(plan.stages[1]!.tasks.map((t) => t.id)).toEqual(["T-003"]);
  });

  test("parses each task's id, title, and objective", () => {
    const t = parsePlan(samplePlan).stages[0]!.tasks[0]!;
    expect(t.id).toBe("T-001");
    expect(t.title).toBe("Confirm current init behavior");
    expect(t.objective).toBe("Lock existing init behavior under test before changing it.");
  });

  test("splits target files on commas, trimmed", () => {
    const t = parsePlan(samplePlan).stages[0]!.tasks[1]!;
    expect(t.targetFiles).toEqual(["src/cli/cli.ts", "src/cli/commands/telegram-setup.ts"]);
  });

  test("parses dependencies, with 'None' yielding an empty list", () => {
    const tasks = parsePlan(samplePlan).stages.flatMap((s) => s.tasks);
    expect(tasks[0]!.dependencies).toEqual([]); // None
    expect(tasks[1]!.dependencies).toEqual(["T-001"]);
    expect(tasks[2]!.dependencies).toEqual(["T-001", "T-002"]); // "T-001 , T-002"
  });

  test("collects acceptance criteria as a list", () => {
    const t = parsePlan(samplePlan).stages[0]!.tasks[0]!;
    expect(t.acceptanceCriteria).toEqual([
      "Legacy --telegram flag still fails with guidance",
      "init scaffolds omit telegram config",
    ]);
  });

  test("throws when the plan has no stages", () => {
    expect(() => parsePlan("# Plan\n\nNo stages here.")).toThrow(/no stages/i);
  });

  test("throws when a stage has no tasks", () => {
    const bad = `## Stages\n\n### Stage 1 - Empty\n\nnothing\n`;
    expect(() => parsePlan(bad)).toThrow(/stage 1.*no tasks/i);
  });
});
