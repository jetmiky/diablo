/**
 * GitCli is the real GitPort: it shells out to git via an injected
 * ProcessRunner. The ProcessRunner seam keeps this logic unit-testable with a
 * fake; the live binding (NodeProcessRunner) is used in production.
 */
import { NoChangesToCommitError, type GitPort } from "../ports/git.ts";
import type { GitMergePort, MergeResult } from "../ports/git-merge.ts";
import type { ProcessRunner } from "../ports/agent.ts";

export class GitCli implements GitPort, GitMergePort {
  constructor(
    private readonly repoRoot: string,
    private readonly runner: ProcessRunner,
  ) {}

  async worktreeAdd(issue: string, baseBranch: string, branch?: string): Promise<string> {
    const path = `${this.repoRoot}/.worktrees/${issue}`;
    const branchName = branch ?? `diablo/${issue}`;

    const outcome = await this.runner.run(
      "git",
      ["worktree", "add", "-b", branchName, path, baseBranch],
      this.repoRoot,
    );

    if (outcome.exitCode !== 0) {
      throw new Error(
        `git worktree add failed with code ${outcome.exitCode}.\n${outcome.stderr.trim()}`,
      );
    }

    return path;
  }

  async commit(worktree: string, message: string): Promise<string> {
    // Stage all changes
    const addOutcome = await this.runner.run("git", ["add", "-A"], worktree);
    if (addOutcome.exitCode !== 0) {
      throw new Error(
        `git add -A failed with code ${addOutcome.exitCode}.\n${addOutcome.stderr.trim()}`,
      );
    }

    // Commit
    const commitOutcome = await this.runner.run(
      "git",
      ["commit", "-m", message],
      worktree,
    );
    if (commitOutcome.exitCode !== 0) {
      // git prints "nothing to commit" on stdout, not stderr.
      const combined = `${commitOutcome.stdout}\n${commitOutcome.stderr}`;
      if (/nothing to commit/i.test(combined)) {
        throw new NoChangesToCommitError(worktree);
      }
      throw new Error(
        `git commit failed with code ${commitOutcome.exitCode}.\n${commitOutcome.stderr.trim()}`,
      );
    }

    // Get the SHA
    const revParseOutcome = await this.runner.run(
      "git",
      ["rev-parse", "HEAD"],
      worktree,
    );
    if (revParseOutcome.exitCode !== 0) {
      throw new Error(
        `git rev-parse HEAD failed with code ${revParseOutcome.exitCode}.\n${revParseOutcome.stderr.trim()}`,
      );
    }

    return revParseOutcome.stdout.trim();
  }

  async headSha(worktree: string): Promise<string> {
    const outcome = await this.runner.run(
      "git",
      ["rev-parse", "HEAD"],
      worktree,
    );

    if (outcome.exitCode !== 0) {
      throw new Error(
        `git rev-parse HEAD failed with code ${outcome.exitCode}.\n${outcome.stderr.trim()}`,
      );
    }

    return outcome.stdout.trim();
  }

  async diffStat(worktree: string, baseBranch: string): Promise<string> {
    const outcome = await this.runner.run(
      "git",
      ["diff", "--stat", baseBranch],
      worktree,
    );

    if (outcome.exitCode !== 0) {
      throw new Error(
        `git diff --stat failed with code ${outcome.exitCode}.\n${outcome.stderr.trim()}`,
      );
    }

    return outcome.stdout;
  }

  /**
   * Merge `branch` into `targetBranch` in the PRIMARY working copy (repoRoot,
   * not a worktree). Detect-and-halt: on conflict, collect the conflicting
   * files and `git merge --abort` so the tree is left clean — conflicts are
   * NEVER auto-resolved. Throws only on an unexpected git failure (e.g. the
   * target branch cannot be checked out), not on an ordinary conflict.
   */
  async merge(targetBranch: string, branch: string): Promise<MergeResult> {
    const checkout = await this.runner.run("git", ["checkout", targetBranch], this.repoRoot);
    if (checkout.exitCode !== 0) {
      throw new Error(
        `git checkout ${targetBranch} failed with code ${checkout.exitCode}.\n${checkout.stderr.trim()}`,
      );
    }

    const merge = await this.runner.run("git", ["merge", "--no-ff", branch], this.repoRoot);
    if (merge.exitCode === 0) {
      return { ok: true };
    }

    // Conflict (or other non-clean merge): gather the unmerged files, then
    // abort so nothing is left half-merged. Never auto-resolve.
    const conflicts = await this.conflictingFiles();
    await this.runner.run("git", ["merge", "--abort"], this.repoRoot);
    return { ok: false, conflicts };
  }

  /**
   * Returns true if every commit on `branch` is already contained in
   * `targetBranch` (i.e., the branch has been merged). Runs in the PRIMARY
   * working copy (repoRoot). Throws on git failure (e.g., unknown ref).
   */
  async isMerged(branch: string, targetBranch: string): Promise<boolean> {
    const outcome = await this.runner.run(
      "git",
      ["merge-base", "--is-ancestor", branch, targetBranch],
      this.repoRoot,
    );

    if (outcome.exitCode === 0) {
      return true;
    }

    if (outcome.exitCode === 1) {
      return false;
    }

    // Any other non-zero exit (e.g., unknown ref) is an error
    throw new Error(
      `git merge-base --is-ancestor failed with code ${outcome.exitCode}.\n${outcome.stderr.trim()}`,
    );
  }

  /** The files with merge conflicts (unmerged, diff-filter=U). */
  private async conflictingFiles(): Promise<string[]> {
    const outcome = await this.runner.run(
      "git",
      ["diff", "--name-only", "--diff-filter=U"],
      this.repoRoot,
    );
    return outcome.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
}
