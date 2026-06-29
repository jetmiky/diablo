import { describe, expect, test } from "bun:test";
import { Heartbeat, type IntervalTimer } from "../src/domain/heartbeat.ts";

/**
 * A timer we fire by hand so the ticking is deterministic — the same approach
 * PreviewSession's injectable timer uses. start() captures the callback and
 * cadence; fire() invokes it; stop() drops it so a fire after stop is a no-op.
 */
class FakeTimer implements IntervalTimer {
  private fn?: () => void;
  ms?: number;
  started = false;
  start(fn: () => void, ms: number): void {
    this.fn = fn;
    this.ms = ms;
    this.started = true;
  }
  stop(): void {
    this.started = false;
    this.fn = undefined;
  }
  fire(): void {
    this.fn?.();
  }
}

describe("Heartbeat", () => {
  test("emits the elapsed time since start on each tick", () => {
    let clock = 1000;
    const timer = new FakeTimer();
    const ticks: number[] = [];
    const hb = new Heartbeat({
      emit: (elapsedMs) => ticks.push(elapsedMs),
      now: () => clock,
      timer,
      intervalMs: 1000,
    });

    hb.start();
    clock = 3000;
    timer.fire(); // 2s after start
    clock = 8000;
    timer.fire(); // 7s after start

    expect(ticks).toEqual([2000, 7000]);
  });

  test("schedules the timer at the configured base cadence", () => {
    const timer = new FakeTimer();
    const hb = new Heartbeat({ emit: () => {}, timer, intervalMs: 1000 });

    hb.start();

    expect(timer.started).toBe(true);
    expect(timer.ms).toBe(1000);
  });

  test("stop() halts further ticks", () => {
    let clock = 0;
    const timer = new FakeTimer();
    const ticks: number[] = [];
    const hb = new Heartbeat({ emit: (e) => ticks.push(e), now: () => clock, timer });

    hb.start();
    hb.stop();
    clock = 5000;
    timer.fire(); // timer was cleared on stop → no emit

    expect(timer.started).toBe(false);
    expect(ticks).toEqual([]);
  });

  test("a sink error on a tick never throws out of the ticker (best-effort)", () => {
    const timer = new FakeTimer();
    const hb = new Heartbeat({
      emit: () => {
        throw new Error("telegram down");
      },
      timer,
    });

    hb.start();
    expect(() => timer.fire()).not.toThrow();
  });
});
