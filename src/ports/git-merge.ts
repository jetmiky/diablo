/**
 * GitMergePort is the focused seam for integrating a completed work branch into
 * a target branch. Kept separate from GitPort (interface segregation): merging
 * happens once at the end of a run in the PRIMARY working copy, not per-step in
 * a worktree, and conflict detection has its own result shape.
 *
 * The adapter performs a real merge and reports the outcome structurally — it
 * NEVER auto-resolves conflicts (high blast radius, a human decision). On
 * conflict it aborts cleanly and returns the conflicting files.
 */
export type MergeResult =
  | { ok: true }
  | { ok: false; conflicts: string[] };

export interface GitMergePort {
  /**
   * Merge `branch` into `targetBranch` in the primary working copy. Returns
   * { ok: true } on a clean merge; on conflict, aborts the merge and returns
   * { ok: false, conflicts } with the conflicting file paths. Throws only on
   * an unexpected git failure (not on an ordinary conflict).
   */
  merge(targetBranch: string, branch: string): Promise<MergeResult>;
}
