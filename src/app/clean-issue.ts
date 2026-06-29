/**
 * cleanIssue is the teardown use-case behind `diablo clean [issue]`: it reclaims
 * an issue's worktree (and optionally its branch) once the user is done with it.
 * Per ADR 0002 this is ALWAYS explicit, never automatic — nothing auto-deletes,
 * so resume-awareness is fully preserved (a halted run can still be resumed).
 *
 * The safety guard is the point: without --force it REFUSES to remove a worktree
 * whose branch is not merged into the target branch (reusing isMerged), so a
 * user can't accidentally destroy unmerged work. --force skips the guard and
 * force-deletes the branch. If the worktree is already gone, it's a no-op
 * ("nothing") — idempotent and safe to re-run.
 *
 * Pure orchestration over injected seams (fs + git teardown + merge check), so
 * it is unit-tested against fakes; the live binding is GitCli + NodeFs.
 */
import type { FsPort } from "../ports/fs.ts";

/** The git teardown operations this use-case needs (a narrow slice of GitPort). */
export interface CleanGitPort {
  /** Remove the worktree at `worktree` (`git worktree remove`; force adds --force). */
  worktreeRemove(worktree: string, force: boolean): Promise<void>;
  /** Delete `branch` (`git branch -d`; force uses -D to drop an unmerged branch). */
  branchDelete(branch: string, force: boolean): Promise<void>;
}

/** The merge check used by the unmerged-branch guard (a slice of GitMergePort). */
export interface CleanMergePort {
  isMerged(branch: string, targetBranch: string): Promise<boolean>;
}

export interface CleanIssueDeps {
  fs: FsPort;
  git: CleanGitPort;
  merge: CleanMergePort;
}

export interface CleanIssueOpts {
  issue: string;
  worktree: string;
  branch: string;
  targetBranch: string;
  /** Whether to also delete the branch (not just remove the worktree). */
  deleteBranch: boolean;
  /** Skip the unmerged guard and force-remove the worktree + force-delete the branch. */
  force: boolean;
}

export type CleanResult =
  | { status: "cleaned"; removedWorktree: boolean; deletedBranch: boolean }
  | { status: "refused"; reason: string }
  | { status: "nothing" };

export async function cleanIssue(
  deps: CleanIssueDeps,
  opts: CleanIssueOpts,
): Promise<CleanResult> {
  // Idempotent: if the worktree is already gone, there's nothing to reclaim.
  if (!(await deps.fs.exists(opts.worktree))) {
    return { status: "nothing" };
  }

  // The guard: without --force, never destroy a worktree whose branch hasn't
  // landed in the target branch. With --force we skip the check entirely.
  if (!opts.force) {
    const merged = await deps.merge.isMerged(opts.branch, opts.targetBranch);
    if (!merged) {
      return {
        status: "refused",
        reason:
          `branch ${opts.branch} is not merged into ${opts.targetBranch}. ` +
          `Refusing to remove its worktree — re-run with --force to discard the unmerged work.`,
      };
    }
  }

  await deps.git.worktreeRemove(opts.worktree, opts.force);

  let deletedBranch = false;
  if (opts.deleteBranch) {
    await deps.git.branchDelete(opts.branch, opts.force);
    deletedBranch = true;
  }

  return { status: "cleaned", removedWorktree: true, deletedBranch };
}
