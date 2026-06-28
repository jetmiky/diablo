/**
 * ProgressMdAdapter is a ProgressPort that keeps a LIVE progress.md tracker on
 * disk. It owns a ProgressTracker, applies each event, and rewrites the single
 * progress file — so progress.md is always current, never the dead skeleton the
 * master-plan skill used to leave behind. The tracker is exposed so the run
 * loop can fold a per-stage handoff note in before the next stage.
 */
import type { FsPort } from "../ports/fs.ts";
import type { ProgressEvent, ProgressPort } from "../ports/progress.ts";
import { ProgressTracker } from "../domain/progress-tracker.ts";

export class ProgressMdAdapter implements ProgressPort {
  readonly tracker: ProgressTracker;

  constructor(
    private readonly fs: FsPort,
    private readonly path: string,
    issue: string,
  ) {
    this.tracker = new ProgressTracker(issue);
  }

  async emit(event: ProgressEvent): Promise<void> {
    this.tracker.apply(event);
    await this.fs.write(this.path, this.tracker.render());
  }

  /** Re-persist after an out-of-band tracker mutation (e.g. a handoff note). */
  async flush(): Promise<void> {
    await this.fs.write(this.path, this.tracker.render());
  }
}
