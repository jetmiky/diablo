/**
 * mergeGitignore computes the .gitignore content `diablo init` should write,
 * idempotently. diablo creates machine-managed runtime dirs (.diablo/,
 * .worktrees/) that must never be committed in ANY project it scaffolds, so
 * those always land in a clearly-marked managed block.
 *
 * Pure (string in, string-or-null out) so the merge rules are unit-tested
 * directly; the adapter only reads the existing file and writes the result.
 */

/** Marker fences delimiting the block diablo owns, so re-runs are idempotent. */
const BLOCK_START = "# --- diablo (managed) ---";
const BLOCK_END = "# --- end diablo (managed) ---";

/** Runtime dirs diablo creates in every project — never version-controlled. */
const RUNTIME_ENTRIES = [".diablo/", ".worktrees/"];

/**
 * Common ignores seeded ONLY for greenfield projects (no commits yet), where no
 * .gitignore convention has been established. Brownfield repos already own these
 * decisions, so diablo never imposes them there.
 */
const GREENFIELD_ENTRIES = ["node_modules/", "dist/", ".env"];

/**
 * Computes the .gitignore content for `diablo init`.
 *
 * @param existing the current .gitignore content, or null if none exists.
 * @param greenfield true when the repo has no commits yet — a fresh project,
 *   where diablo also seeds common ignores (node_modules/, dist/, .env) since
 *   nothing has established them. Brownfield repos keep their own conventions;
 *   diablo only contributes its runtime dirs.
 * @returns the content to write, or null when nothing needs to change (the
 *   managed block is already present).
 */
export function mergeGitignore(existing: string | null, greenfield: boolean): string | null {
  if (existing === null) {
    // No file yet: this is the only moment diablo seeds greenfield conventions.
    return buildBlock(greenfield);
  }
  // The managed block is already present — nothing to change (idempotent).
  if (existing.includes(BLOCK_START)) return null;
  // A file exists, so the project already owns its ignore conventions; diablo
  // contributes ONLY its runtime block, never the greenfield seeds.
  return `${existing.trimEnd()}\n\n${buildBlock(false)}`;
}

function buildBlock(greenfield: boolean): string {
  const entries = greenfield ? [...RUNTIME_ENTRIES, ...GREENFIELD_ENTRIES] : [...RUNTIME_ENTRIES];
  return [BLOCK_START, ...entries, BLOCK_END, ""].join("\n");
}
