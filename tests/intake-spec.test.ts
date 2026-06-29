import { describe, expect, test } from "bun:test";
import { intakeSessionId, buildIntakeArgs } from "../src/domain/intake-spec.ts";

describe("intakeSessionId", () => {
  test("derives a stable, feature-scoped session id", () => {
    expect(intakeSessionId("billing")).toBe("diablo-intake-billing");
  });
});

describe("buildIntakeArgs", () => {
  const base = { sessionId: "diablo-intake-billing", skillPath: "/skills/grill-with-docs/SKILL.md", instruction: "Gather requirements." };

  test("includes --session-id so steps share one resumable session", () => {
    const args = buildIntakeArgs(base);
    const i = args.indexOf("--session-id");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe("diablo-intake-billing");
  });

  test("injects the skill as an @file reference", () => {
    expect(buildIntakeArgs(base)).toContain("@/skills/grill-with-docs/SKILL.md");
  });

  test("passes the instruction as the trailing message", () => {
    const args = buildIntakeArgs(base);
    expect(args.at(-1)).toBe("Gather requirements.");
  });

  test("does NOT use -p — intake is interactive, not headless", () => {
    expect(buildIntakeArgs(base)).not.toContain("-p");
  });

  test("optionally injects input artifacts (e.g. the state-machine path) as @files", () => {
    const args = buildIntakeArgs({ ...base, inputs: ["/proj/.scratch/billing/state-machine.md"] });
    expect(args).toContain("@/proj/.scratch/billing/state-machine.md");
  });
});

