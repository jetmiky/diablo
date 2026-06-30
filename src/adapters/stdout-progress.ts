/**
 * StdoutProgress is a ProgressPort that prints to stdout — the always-on,
 * zero-config progress sink. It renders the semantic markdown that `formatEvent`
 * produces into terminal-appropriate text via `renderAnsi`, and adapts its
 * behaviour to the resolved StdoutCapabilities:
 *
 *   - DISCRETE events print as their own newline-terminated line, the durable
 *     scrollback record of the run. With `colour`, markdown emphasis becomes
 *     ANSI; without it, the markup is stripped to clean plain text (no leaked
 *     `**` asterisks — the bug that came from borrowing the Telegram formatter).
 *
 *   - HEARTBEAT ticks animate a spinner ON THE SAME LINE when `animate` is set:
 *     each tick rewrites the current line with a carriage return (no newline)
 *     and advances a braille glyph, so a long step shows a live elapsed timer
 *     instead of silence. When a discrete event follows an active spinner, a
 *     newline is emitted first so the spinner's last frame survives in
 *     scrollback. When `animate` is OFF (a non-TTY: piped, redirected, CI),
 *     heartbeats are SUPPRESSED entirely — carriage-return redraws would garble
 *     a log file, and a discrete-event-only stream is the right shape there.
 *
 * The write sink and capabilities are injected so the rendering and animation
 * are unit-tested without touching the real stdout or a real terminal.
 */
import type { ProgressEvent, ProgressPort } from "../ports/progress.ts";
import type { StdoutCapabilities } from "../domain/stdout-capabilities.ts";
import { formatEvent } from "../domain/progress-message.ts";
import { renderAnsi } from "../domain/terminal-ansi.ts";

/** Braille spinner frames, cycled one per heartbeat tick. */
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export class StdoutProgress implements ProgressPort {
  private readonly capabilities: StdoutCapabilities;
  private readonly write: (s: string) => void;
  private spinnerFrame = 0;
  /** True while the current terminal line holds an unterminated spinner. */
  private spinnerActive = false;

  constructor(
    capabilities: StdoutCapabilities,
    write: (s: string) => void = (s) => void process.stdout.write(s),
  ) {
    this.capabilities = capabilities;
    this.write = write;
  }

  emit(event: ProgressEvent): Promise<void> {
    if (event.kind === "heartbeat") {
      // Animation off (non-TTY): drop heartbeats so a piped log isn't flooded
      // with carriage-return spinner frames.
      if (this.capabilities.animate) this.writeSpinner(event);
      return Promise.resolve();
    }
    // A discrete event after a live spinner: break the spinner line first so
    // its last frame survives in scrollback and the discrete line is clean.
    if (this.spinnerActive) {
      this.write(`\n${this.render(event)}\n`);
      this.spinnerActive = false;
      return Promise.resolve();
    }
    this.write(`${this.render(event)}\n`);
    return Promise.resolve();
  }

  private writeSpinner(event: ProgressEvent & { kind: "heartbeat" }): void {
    const glyph = SPINNER[this.spinnerFrame % SPINNER.length]!;
    this.spinnerFrame += 1;
    // \r returns to the start of the line so the next tick overwrites this one;
    // no trailing newline keeps the spinner animating in place.
    this.write(`\r${glyph} ${this.render(event)}`);
    this.spinnerActive = true;
  }

  /** Format the event to markdown, then render it for the terminal surface. */
  private render(event: ProgressEvent): string {
    return renderAnsi(formatEvent(event), this.capabilities.colour);
  }
}
