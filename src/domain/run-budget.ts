/**
 * RunBudget is the global circuit breaker for an unattended run: it caps both
 * the whole-run wall-clock and the total number of agent steps, so a
 * pathological run (a stuck loop, a runaway re-plan) aborts cleanly instead of
 * burning time and model spend with nobody watching.
 *
 * It is checked ONCE per agent step, before the step runs. The clock starts at
 * the FIRST check (run start), not at construction, so a budget built during
 * wiring doesn't eat into the allowance. Pure and deterministic: the clock is
 * injected, so the ceilings are unit-tested by advancing a fake clock — no real
 * timers. The caller (runIssue) catches RunBudgetExceededError and halts the
 * run as needs-human, preserving committed work.
 */

export interface RunBudgetLimits {
  /** Max whole-run wall-clock in ms. */
  runBudgetMs: number;
  /** Max number of agent steps in the run. */
  maxSteps: number;
}

/** Thrown when a run exceeds its wall-clock or step-count ceiling. */
export class RunBudgetExceededError extends Error {
  constructor(reason: string) {
    super(`Run budget exceeded: ${reason}`);
    this.name = "RunBudgetExceededError";
  }
}

export class RunBudget {
  private startedAt?: number;
  private steps = 0;

  constructor(
    private readonly limits: RunBudgetLimits,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Account for one upcoming step and assert both ceilings still hold. Call
   * before each agent step. Throws RunBudgetExceededError if this step would
   * breach the step-count cap, or if the run's wall-clock has passed the budget.
   */
  check(): void {
    if (this.startedAt === undefined) this.startedAt = this.now();

    this.steps += 1;
    if (this.steps > this.limits.maxSteps) {
      throw new RunBudgetExceededError(
        `step count ${this.steps} exceeds maxSteps ${this.limits.maxSteps}`,
      );
    }

    const elapsed = this.now() - this.startedAt;
    if (elapsed > this.limits.runBudgetMs) {
      throw new RunBudgetExceededError(
        `wall-clock ${elapsed}ms exceeds runBudgetMs ${this.limits.runBudgetMs}`,
      );
    }
  }
}
