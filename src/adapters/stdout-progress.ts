/**
 * StdoutProgress is a ProgressPort that prints to stdout — the always-on,
 * zero-config progress sink. It shares the event formatter with the Telegram
 * sink so content matches across surfaces, and handles two event kinds:
 *
 *   - DISCRETE events print as their own newline-terminated line, the durable
 *     scrollback record of the run.
 *
 *   - HEARTBEAT ticks animate a spinner ON THE SAME LINE: each tick rewrites
 *     the current line with a carriage return (no newline) and advances a
 *     braille spinner glyph, so a long step shows a live elapsed timer instead
 *     of silence. When a discrete event follows an active spinner, a newline is
 *     emitted first so the spinner's last frame is preserved in scrollback and
 *     the discrete line starts clean.
 *
 * The write sink is injected so the animation (carriage returns, glyph cycling)
 * is unit-tested without touching the real stdout.
 */
import type { ProgressEvent, ProgressPort } from "../ports/progress.ts";
import { formatEvent } from "../domain/progress-message.ts";

/** Braille spinner frames, cycled one per heartbeat tick. */
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export class StdoutProgress implements ProgressPort {
  private readonly write: (s: string) => void;
  private spinnerFrame = 0;
  /** True while the current terminal line holds an unterminated spinner. */
  private spinnerActive = false;

  constructor(write: (s: string) => void = (s) => void process.stdout.write(s)) {
    this.write = write;
  }

  emit(event: ProgressEvent): Promise<void> {
    if (event.kind === "heartbeat") {
      this.writeSpinner(event);
      return Promise.resolve();
    }
    // A discrete event after a live spinner: break the spinner line first so
    // its last frame survives in scrollback and the discrete line is clean.
    if (this.spinnerActive) {
      this.write("\n");
      this.spinnerActive = false;
    }
    this.write(`${formatEvent(event)}\n`);
    return Promise.resolve();
  }

  private writeSpinner(event: ProgressEvent & { kind: "heartbeat" }): void {
    const glyph = SPINNER[this.spinnerFrame % SPINNER.length]!;
    this.spinnerFrame += 1;
    // \r returns to the start of the line so the next tick overwrites this one;
    // no trailing newline keeps the spinner animating in place.
    this.write(`\r${glyph} ${formatEvent(event)}`);
    this.spinnerActive = true;
  }
}
