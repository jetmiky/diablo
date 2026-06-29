/**
 * diablo writes per-run machine artifacts — the frozen plan, the live progress
 * tracker, and per-stage design notes — under a `.plans/` dir INSIDE each
 * issue's worktree. These must never be committed onto the feature branch (and
 * thus never merged into the product's history): they are runtime state, not
 * source.
 *
 * The worktree's own `.gitignore` can't be relied on (a brownfield project owns
 * it, and editing it would itself be a tracked change), and `info/exclude`
 * resolves to the SHARED common git dir across all worktrees — verified to be
 * the wrong scope. The portable, per-worktree-correct idiom is a self-ignoring
 * `.gitignore` placed inside the artifact dir whose single `*` rule ignores
 * everything in the dir, including that `.gitignore` itself. So `git add -A`
 * stages source changes only and the entire `.plans/` tree stays uncommittable.
 *
 * Pure (worktree path in, file path + content out) so it is unit-tested
 * directly; the caller writes the file via the FsPort at worktree setup.
 */

/** The per-worktree dir holding diablo's machine artifacts (plan, progress, design notes). */
export const ARTIFACT_DIR = ".plans";

export interface ArtifactIgnore {
  /** Absolute path of the self-ignoring .gitignore to write. */
  path: string;
  /** Its content — a single "*" that ignores the whole dir, the file included. */
  content: string;
}

/**
 * Computes the self-ignoring `.gitignore` for an issue's worktree artifact dir.
 * Writing this file makes the entire `${worktree}/.plans/` tree uncommittable.
 */
export function artifactIgnore(worktree: string): ArtifactIgnore {
  return {
    path: `${worktree}/${ARTIFACT_DIR}/.gitignore`,
    content: "*\n",
  };
}
