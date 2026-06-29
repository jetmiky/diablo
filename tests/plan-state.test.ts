import { describe, expect, test } from "bun:test";
import { nextPlanState } from "../src/domain/plan-state.ts";

describe("nextPlanState", () => {
  // Legal transitions
  test("no-plan + propose → draft", () => {
    expect(nextPlanState("no-plan", "propose")).toBe("draft");
  });

  test("draft + revise → draft", () => {
    expect(nextPlanState("draft", "revise")).toBe("draft");
  });

  test("draft + approve → frozen", () => {
    expect(nextPlanState("draft", "approve")).toBe("frozen");
  });

  test("draft + propose → draft (re-propose stays draft)", () => {
    expect(nextPlanState("draft", "propose")).toBe("draft");
  });

  test("frozen + reopen → draft", () => {
    expect(nextPlanState("frozen", "reopen")).toBe("draft");
  });

  // Illegal transitions
  test("no-plan + approve → error", () => {
    expect(() => nextPlanState("no-plan", "approve")).toThrow(/cannot approve from no-plan/i);
  });

  test("no-plan + revise → error", () => {
    expect(() => nextPlanState("no-plan", "revise")).toThrow(/cannot revise from no-plan/i);
  });

  test("no-plan + reopen → error", () => {
    expect(() => nextPlanState("no-plan", "reopen")).toThrow(/cannot reopen from no-plan/i);
  });

  test("frozen + approve → error", () => {
    expect(() => nextPlanState("frozen", "approve")).toThrow(/cannot approve from frozen/i);
  });

  test("frozen + propose → error", () => {
    expect(() => nextPlanState("frozen", "propose")).toThrow(/cannot propose from frozen/i);
  });

  test("frozen + revise → error", () => {
    expect(() => nextPlanState("frozen", "revise")).toThrow(/cannot revise from frozen/i);
  });

  test("draft + reopen → error", () => {
    expect(() => nextPlanState("draft", "reopen")).toThrow(/cannot reopen from draft/i);
  });
});
