/**
 * Heartbeat is a steady liveness ticker. While a long, otherwise-silent agent
 * step runs, it invokes a callback at a fixed BASE cadence with the elapsed
 * time since start, so a progress sink can show the run is alive (and for how
 * long). It owns no rendering and no transport: it only answers "still working,
 * N ms in" on a clock. Per-surface throttling (e.g. Telegram's 15s edit window)
 * is the sink's concern, not the ticker's.
 *
 * Pure and deterministic: the clock and the interval timer are injected, so the
 * ticking is unit-tested by firing a fake timer by hand — the same pattern
 * PreviewSession uses. The live binding wraps setInterval.
 */

/** The repeating-timer seam. start() schedules fn every ms; stop() cancels it. */
export interface IntervalTimer {
  start(fn: () => void, ms: number): void;
  stop(): void;
}

function realIntervalTimer(): IntervalTimer {
  let handle: ReturnType<typeof setInterval> | undefined;
  return {
    start(fn, ms) {
      if (handle) clearInterval(handle);
      handle = setInterval(fn, ms);
      // Don't keep the process alive solely for heartbeats; the run loop owns
      // the lifetime. unref is present under Node and Bun.
      handle.unref?.();
    },
    stop() {
      if (handle) {
        clearInterval(handle);
        handle = undefined;
      }
    },
  };
}

/** Base cadence between ticks. Sinks may throttle further; this is the floor. */
const DEFAULT_INTERVAL_MS = 1000;

export interface HeartbeatDeps {
  /** Called on each tick with the ms elapsed since start(). */
  emit: (elapsedMs: number) => void;
  /** Clock, injectable for tests. Default Date.now. */
  now?: () => number;
  /** Repeating timer, injectable for tests. Default setInterval-backed. */
  timer?: IntervalTimer;
  /** Base tick cadence in ms. Default 1000. */
  intervalMs?: number;
}

export class Heartbeat {
  private readonly emit: (elapsedMs: number) => void;
  private readonly now: () => number;
  private readonly timer: IntervalTimer;
  private readonly intervalMs: number;
  private startedAt = 0;

  constructor(deps: HeartbeatDeps) {
    this.emit = deps.emit;
    this.now = deps.now ?? Date.now;
    this.timer = deps.timer ?? realIntervalTimer();
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /** Begin ticking. Records the start time the elapsed value is measured from. */
  start(): void {
    this.startedAt = this.now();
    this.timer.start(() => this.tick(), this.intervalMs);
  }

  /** Stop ticking. A timer that fires after this is a no-op. */
  stop(): void {
    this.timer.stop();
  }

  private tick(): void {
    const elapsed = this.now() - this.startedAt;
    try {
      this.emit(elapsed);
    } catch {
      // Liveness is best-effort: a failing sink must never crash the run.
    }
  }
}
