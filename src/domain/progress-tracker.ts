/**
 * ProgressTracker folds progress events into a LIVE markdown document — the
 * single source of truth for "where is the run?". It replaces the dead
 * progress.md skeleton the master-plan skill used to write but the engine never
 * updated. It also folds in per-stage HANDOFF NOTES (decisions, deferrals,
 * gotchas) so there is ONE artifact, not a separate handoff file that drifts.
 *
 * Pure (no I/O): the fs/Telegram adapters persist or post render() output. The
 * prior stage's handoff note is retrievable via handoffNote() so the next
 * stage's design step can receive it as an input.
 */
import type { ProgressEvent } from "../ports/progress.ts";

type StageStatus = "TODO" | "IN_PROGRESS" | "DONE" | "HALTED";

interface StageState {
  stage: string;
  title: string;
  status: StageStatus;
  sha?: string;
  verdict?: "pass" | "fail";
  retries: number;
  handoff?: string;
}

export class ProgressTracker {
  private readonly stages = new Map<string, StageState>();
  private total = 0;
  private finalCommit?: string;
  private haltReason?: string;
  private complete = false;

  constructor(private readonly issue: string) {}

  apply(event: ProgressEvent): void {
    switch (event.kind) {
      case "stage-started":
        this.total = Math.max(this.total, event.total);
        this.upsert(event.stage, (s) => {
          s.title = event.title;
          s.status = "IN_PROGRESS";
        });
        return;
      case "committed":
        this.upsert(event.stage, (s) => (s.sha = event.sha));
        return;
      case "verdict":
        this.upsert(event.stage, (s) => (s.verdict = event.verdict));
        return;
      case "handoff":
        this.upsert(event.stage, (s) => (s.handoff = event.note));
        return;
      case "retry":
        this.upsert(event.stage, (s) => (s.retries = Math.max(s.retries, event.attempt)));
        return;
      case "stage-done":
        this.upsert(event.stage, (s) => {
          s.title = event.title;
          s.status = "DONE";
        });
        return;
      case "halted":
        this.haltReason = event.reason;
        // Any in-progress stage is the one that halted.
        for (const s of this.stages.values()) {
          if (s.status === "IN_PROGRESS") s.status = "HALTED";
        }
        return;
      case "done":
        this.finalCommit = event.commit;
        this.complete = true;
        return;
      // design-running / worker-running / verifier-running / waiting-for-approval
      // are transient activity signals; they do not change persisted stage state.
      default:
        return;
    }
  }

  /** Attaches a handoff note (decisions/deferrals/gotchas) to a stage. */
  setHandoffNote(stage: string, note: string): void {
    this.upsert(stage, (s) => (s.handoff = note));
  }

  /** The handoff note for a stage, if one was recorded. */
  handoffNote(stage: string): string | undefined {
    return this.stages.get(stage)?.handoff;
  }

  /** Renders the live tracker as markdown. */
  render(): string {
    const lines: string[] = [];
    lines.push(`# Progress — ${this.issue}`, "");

    if (this.complete) {
      lines.push(`Status: ✅ complete${this.finalCommit ? ` (${short(this.finalCommit)})` : ""}`, "");
    } else if (this.haltReason) {
      lines.push(`Status: ⏸ HALTED — ${this.haltReason}`, "");
    } else {
      lines.push(`Status: in progress`, "");
    }

    lines.push("## Stages", "");
    const ordered = [...this.stages.values()];
    for (const s of ordered) {
      const bits = [`- [${mark(s.status)}] **${s.title}** (${s.stage}) — ${s.status}`];
      const detail: string[] = [];
      if (s.sha) detail.push(`commit ${short(s.sha)}`);
      if (s.verdict) detail.push(`verdict ${s.verdict.toUpperCase()}`);
      if (s.retries > 0) detail.push(`${s.retries} retry/attempt`);
      if (detail.length) bits.push(`  - ${detail.join(", ")}`);
      if (s.handoff) bits.push(`  - handoff: ${s.handoff}`);
      lines.push(bits.join("\n"));
    }

    lines.push("", "## Pending Todos", "");
    const pending = ordered.filter((s) => s.status === "TODO" || s.status === "IN_PROGRESS");
    const knownPending = this.total - ordered.filter((s) => s.status === "DONE").length;
    if (pending.length === 0 && knownPending <= 0 && this.complete) {
      lines.push("- none — all stages complete");
    } else {
      for (const s of pending) lines.push(`- ${s.title} (${s.stage}): ${s.status}`);
      const remaining = this.total - ordered.length;
      if (remaining > 0) lines.push(`- ${remaining} further stage(s) not yet started`);
      if (pending.length === 0 && remaining <= 0) lines.push("- (awaiting next stage)");
    }

    return lines.join("\n") + "\n";
  }

  private upsert(stage: string, mutate: (s: StageState) => void): void {
    let s = this.stages.get(stage);
    if (!s) {
      s = { stage, title: stage, status: "TODO", retries: 0 };
      this.stages.set(stage, s);
    }
    mutate(s);
  }
}

function short(sha: string): string {
  return sha.slice(0, 7);
}

function mark(status: StageStatus): string {
  return status === "DONE" ? "x" : " ";
}
