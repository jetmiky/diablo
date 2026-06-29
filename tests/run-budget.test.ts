import { describe, expect, test } from "bun:test";
import { RunBudget, RunBudgetExceededError } from "../src/domain/run-budget.ts";

const limits = { runBudgetMs: 10_000, maxSteps: 3 };

describe("RunBudget", () => {
  test("permits steps while under both ceilings", () => {
    let t = 0;
    const budget = new RunBudget(limits, () => t);
    budget.check(); // step 1 at t=0
    t = 5_000;
    budget.check(); // step 2, under time + count
    expect(true).toBe(true); // no throw
  });

  test("throws when the step count exceeds maxSteps", () => {
    const budget = new RunBudget(limits, () => 0);
    budget.check(); // 1
    budget.check(); // 2
    budget.check(); // 3
    expect(() => budget.check()).toThrow(RunBudgetExceededError); // 4 > 3
  });

  test("the step-count error names the limit that tripped", () => {
    const budget = new RunBudget({ runBudgetMs: 10_000, maxSteps: 1 }, () => 0);
    budget.check();
    try {
      budget.check();
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RunBudgetExceededError);
      expect((err as RunBudgetExceededError).message).toMatch(/maxSteps|step count|2.*1/i);
    }
  });

  test("throws when wall-clock exceeds runBudgetMs", () => {
    let t = 0;
    const budget = new RunBudget(limits, () => t);
    budget.check(); // t=0, ok
    t = 10_001; // past the 10s budget
    expect(() => budget.check()).toThrow(RunBudgetExceededError);
  });

  test("the wall-clock error names the budget", () => {
    let t = 0;
    const budget = new RunBudget(limits, () => t);
    budget.check();
    t = 20_000;
    try {
      budget.check();
      throw new Error("expected throw");
    } catch (err) {
      expect((err as RunBudgetExceededError).message).toMatch(/budget|wall.?clock|time/i);
    }
  });

  test("measures elapsed from the first check (run start), not from construction", () => {
    let t = 100_000;
    const budget = new RunBudget(limits, () => t); // constructed late
    budget.check(); // start clock here, at t=100_000
    t = 105_000; // 5s into the run
    budget.check(); // still under 10s budget — no throw
    t = 111_000; // 11s in
    expect(() => budget.check()).toThrow(RunBudgetExceededError);
  });
});
