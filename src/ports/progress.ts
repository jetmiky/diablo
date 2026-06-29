/**
 * ProgressPort is the seam the orchestration layer emits structured progress
 * events through. Keeping it a port keeps the domain/app clean: stdout, a live
 * progress.md tracker, and a Telegram adapter all implement the SAME interface,
 * and the run loop depends only on this — never on a concrete sink.
 *
 * "Idle vs working" is derived from the event, not tracked separately: a
 * `waiting-for-approval` event means idle (a human is the bottleneck); any
 * mid-stage event (`design-running`, `worker-running`, ...) means working.
 */

export type ProgressEvent =
  | { kind: "stage-started"; stage: string; title: string; index: number; total: number }
  | { kind: "design-running"; stage: string }
  | { kind: "worker-running"; stage: string }
  | { kind: "verifier-running"; stage: string }
  | { kind: "committed"; stage: string; sha: string }
  | { kind: "verdict"; stage: string; verdict: "pass" | "fail" }
  | {
      /**
       * Files a stage's worker commit touched that fall outside the task's
       * declared Target Files (and are not tests). Surfaced, never blocking —
       * an AFK run should flag scope creep without halting on it. `files` is
       * non-empty when emitted.
       */
      kind: "scope-warning";
      stage: string;
      files: string[];
    }
  | { kind: "handoff"; stage: string; note: string }
  | { kind: "stage-done"; stage: string; title: string }
  | { kind: "waiting-for-approval"; stage: string }
  | { kind: "retry"; stage: string; attempt: number }
  | {
      /**
       * A liveness tick emitted at a steady cadence WHILE a step is in flight,
       * so a surface can show the run is alive (and for how long) during the
       * long silent gap inside a single agent run. `elapsedMs` is the time the
       * current step has been running; `activity`, when known, is a short label
       * of what the agent is doing (filled once Pi's stream is parsed — absent
       * for now). Distinct from the discrete lifecycle events: heartbeats are
       * coalesced/throttled per-sink and never written to the structural tracker.
       */
      kind: "heartbeat";
      stage: string;
      elapsedMs: number;
      activity?: string;
    }
  | { kind: "done"; commit?: string }
  | { kind: "halted"; reason: string };

export interface ProgressPort {
  emit(event: ProgressEvent): Promise<void>;
}

/**
 * Whether an event represents the pipeline actively working (true) or idle and
 * waiting on a human (false). Derived purely from the event kind so any sink
 * can show an accurate "working / idle" indicator without extra state.
 */
export function isWorking(event: ProgressEvent): boolean {
  switch (event.kind) {
    case "waiting-for-approval":
    case "done":
    case "halted":
      return false;
    default:
      return true;
  }
}
