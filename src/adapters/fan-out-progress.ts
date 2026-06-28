/**
 * FanOutProgress forwards each progress event to several sinks (stdout,
 * progress.md, Telegram). Progress is BEST-EFFORT visibility, never the work
 * itself: a failing sink (e.g. Telegram down) must not crash the pipeline, so
 * each sink's error is swallowed and the rest still receive the event.
 */
import type { ProgressEvent, ProgressPort } from "../ports/progress.ts";

export class FanOutProgress implements ProgressPort {
  constructor(private readonly sinks: ProgressPort[]) {}

  async emit(event: ProgressEvent): Promise<void> {
    await Promise.all(
      this.sinks.map((sink) =>
        sink.emit(event).catch(() => {
          // Best-effort: a progress sink failing must never halt the run.
        }),
      ),
    );
  }
}
