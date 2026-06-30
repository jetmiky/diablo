/**
 * Renders a fixed-width progress bar from a 1-based stage index and total — the
 * visual companion to the `stage N/total` text on a stage-started line. Pure (no
 * I/O), so it is unit-tested directly and the stdout sink just places its output.
 *
 * Uses Unicode block glyphs (█ / ░); the caller is responsible for only emitting
 * it on a TTY (a piped log gets the plain `N/total` text instead). Degenerate
 * inputs are clamped rather than throwing: a zero total yields an empty bar, and
 * an index past the total yields a full bar.
 */

const FILLED = "█";
const EMPTY = "░";

export function progressBar(index: number, total: number, cells: number): string {
  if (total <= 0) return EMPTY.repeat(cells);

  const fraction = Math.min(1, Math.max(0, index / total));
  const filled = Math.min(cells, Math.round(fraction * cells));
  return FILLED.repeat(filled) + EMPTY.repeat(cells - filled);
}
