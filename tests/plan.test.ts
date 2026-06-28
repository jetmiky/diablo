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

  test("accepts stage headings at H2, H3, or H4 (heading level varies in practice)", () => {
    const h2 = `## Stage 1 - Scaffold

[T-001] - Do a thing
- Objective: do it
- Target Files: src/a.ts
- Dependency: None
- Acceptance Criterias:
  - it works
`;
    const plan = parsePlan(h2);
    expect(plan.stages).toHaveLength(1);
    expect(plan.stages[0]!.number).toBe(1);
    expect(plan.stages[0]!.title).toBe("Scaffold");
    expect(plan.stages[0]!.tasks[0]!.id).toBe("T-001");
  });

  test("does not treat a non-stage ## heading as a stage", () => {
    const withIntro = `## Overview

Some prose.

## Stage 1 - Real

[T-001] - Do a thing
- Objective: do it
- Target Files: src/a.ts
- Dependency: None
- Acceptance Criterias:
  - it works
`;
    const plan = parsePlan(withIntro);
    expect(plan.stages).toHaveLength(1);
    expect(plan.stages[0]!.title).toBe("Real");
  });

  test("accepts a colon separator between stage number and title", () => {
    // Planner models vary their punctuation: some write '## Stage 1 - Title',
    // others '## Stage 1: Title'. The parser must tolerate both, or a plan from
    // a different model parses to zero stages and the run dies on load.
    const colon = `## Stage 1: Project Setup

[T-001] - Scaffold
- Objective: set up
- Target Files: package.json
- Dependency: None
- Acceptance Criterias:
  - it builds
`;
    const plan = parsePlan(colon);
    expect(plan.stages).toHaveLength(1);
    expect(plan.stages[0]!.number).toBe(1);
    expect(plan.stages[0]!.title).toBe("Project Setup");
  });

  test("accepts an en-dash separator between stage number and title", () => {
    const endash = `## Stage 2 – Core Implementation

[T-002] - Build
- Objective: build it
- Target Files: src/x.ts
- Dependency: None
- Acceptance Criterias:
  - works
`;
    const plan = parsePlan(endash);
    expect(plan.stages[0]!.title).toBe("Core Implementation");
  });

  test("does not treat a non-stage heading with a colon as a stage", () => {
    const withIntro = `## Summary: what we will do

Prose.

## Stage 1: Real Work

[T-001] - Do a thing
- Objective: do it
- Target Files: src/a.ts
- Dependency: None
- Acceptance Criterias:
  - it works
`;
    const plan = parsePlan(withIntro);
    expect(plan.stages).toHaveLength(1);
    expect(plan.stages[0]!.title).toBe("Real Work");
  });
});
