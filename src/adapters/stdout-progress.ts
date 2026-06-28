/**
 * StdoutProgress is a ProgressPort that prints each event as a one-line status
 * to stdout — the always-on, zero-config progress sink. It shares the event
 * formatter with the Telegram sink so the content matches across surfaces.
 */
import type { ProgressEvent, ProgressPort } from "../ports/progress.ts";
import { formatEvent } from "../domain/progress-message.ts";

export class StdoutProgress implements ProgressPort {
  emit(event: ProgressEvent): Promise<void> {
    process.stdout.write(`${formatEvent(event)}\n`);
    return Promise.resolve();
  }
}
