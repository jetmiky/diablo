/**
 * GitPort is the seam for git operations on isolated worktrees. The real
 * implementation shells out to git CLI; tests use a fake ProcessRunner.
 */

export interface GitPort {
  /** Create an isolated worktree at <repoRoot>/.worktrees/<issue> on a new branch (default diablo/<issue>, or the given branch), cut from baseBranch. Returns the absolute worktree path. */
  worktreeAdd(issue: string, baseBranch: string, branch?: string): Promise<string>;
  /** Stage all changes in the worktree and commit with the given message. Returns the resulting commit SHA (full 40-char). */
  commit(worktree: string, message: string): Promise<string>;
  /** Return the current HEAD SHA (full) of the worktree. */
  headSha(worktree: string): Promise<string>;
  /** Return `git diff --stat` output for the worktree against baseBranch. */
  diffStat(worktree: string, baseBranch: string): Promise<string>;
}
