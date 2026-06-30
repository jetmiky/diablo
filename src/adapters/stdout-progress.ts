/**
 * StdoutProgress is a ProgressPort that prints to stdout — the always-on,
 * zero-config progress sink. It adapts to the resolved StdoutCapabilities:
 *
 *   - DISCRETE events print as their own newline-terminated line, the durable
 *     scrollback record of the run, rendered from the semantic markdown that
 *     `formatEvent` produces via `renderAnsi` (ANSI when colour is on, stripped
 *     to clean plain text when off — no leaked `**` asterisks). On a TTY the
 *     `stage-started` line is augmented with a block progress bar derived from
 *     the event's index/total; a non-TTY keeps the plain `N/total` text.
 *
 *   - HEARTBEAT ticks animate a spinner ON THE SAME LINE when `animate` is set.
 *     The line is COMPOSED here (not via formatEvent) because it is presentation
 *     heavy: a braille spinner, the activity's glyph, the activity label (or a
 *     "working" fallback), and an elapsed timer coloured by how close the step
 *     is to its timeout ceiling. Each tick rewrites the line with a carriage
 *     return; a following discrete event breaks the line first so the spinner's
 *     last frame survives in scrollback. When `animate` is OFF (a non-TTY:
 *     piped, redirected, CI), heartbeats are SUPPRESSED entirely.
 *
 * The write sink, capabilities, and step-timeout ceiling are injected so the
 * rendering and animation are unit-tested without a real stdout or terminal.
 */
import type { ProgressEvent, ProgressPort } from "../ports/progress.ts";
import type { StdoutCapabilities } from "../domain/stdout-capabilities.ts";
import { formatEvent, formatDuration } from "../domain/progress-message.ts";
import { renderAnsi } from "../domain/terminal-ansi.ts";
import { progressBar } from "../domain/progress-bar.ts";
import { activityGlyph } from "../domain/activity-glyph.ts";
import { colourByElapsed } from "../domain/elapsed-colour.ts";

/** Braille spinner frames, cycled one per heartbeat tick. */
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/** Cells in the stage progress bar. Compact so it fits beside the stage text. */
const BAR_CELLS = 16;

export class StdoutProgress implements ProgressPort {
  private readonly capabilities: StdoutCapabilities;
  private readonly write: (s: string) => void;
  /** The per-step timeout ceiling, for colouring the elapsed timer. 0 = none. */
  private readonly stepTimeoutMs: number;
  private spinnerFrame = 0;
  /** True while the current terminal line holds an unterminated spinner. */
  private spinnerActive = false;

  constructor(
    capabilities: StdoutCapabilities,
    write: (s: string) => void = (s) => void process.stdout.write(s),
    stepTimeoutMs = 0,
  ) {
    this.capabilities = capabilities;
    this.write = write;
    this.stepTimeoutMs = stepTimeoutMs;
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
      this.write(`\n${this.renderDiscrete(event)}\n`);
      this.spinnerActive = false;
      return Promise.resolve();
    }
    this.write(`${this.renderDiscrete(event)}\n`);
    return Promise.resolve();
  }

  /**
   * Renders a discrete event line. Most events go straight through the shared
   * markdown formatter; `stage-started` additionally gets a block progress bar
   * on a TTY (where block glyphs render), keeping the plain `N/total` text the
   * formatter already produced for a non-TTY.
   */
  private renderDiscrete(event: ProgressEvent): string {
    const line = renderAnsi(formatEvent(event), this.capabilities.colour);
    if (event.kind === "stage-started" && this.capabilities.animate) {
      const bar = progressBar(event.index, event.total, BAR_CELLS);
      return `${line}  ${bar}`;
    }
    return line;
  }

  private writeSpinner(event: ProgressEvent & { kind: "heartbeat" }): void {
    const glyph = SPINNER[this.spinnerFrame % SPINNER.length]!;
    this.spinnerFrame += 1;
    // \r returns to the start of the line so the next tick overwrites this one;
    // no trailing newline keeps the spinner animating in place.
    this.write(`\r${this.heartbeatLine(glyph, event)}`);
    this.spinnerActive = true;
  }

  /**
   * Composes the heartbeat line: spinner + the activity's glyph + the activity
   * label (or "working") + a colour-shifting elapsed timer. The spinner is the
   * only leading glyph — the old bare `⏳` is gone.
   */
  private heartbeatLine(spinner: string, event: ProgressEvent & { kind: "heartbeat" }): string {
    const activity = event.activity ?? "working";
    const icon = activityGlyph(activity);
    const elapsed = colourByElapsed(
      `${formatDuration(event.elapsedMs)} elapsed`,
      event.elapsedMs,
      this.stepTimeoutMs,
      this.capabilities.colour,
    );
    return `${spinner} ${icon} ${event.stage}: ${activity} · ${elapsed}`;
  }
}
