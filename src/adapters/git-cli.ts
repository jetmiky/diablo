/**
 * GitCli is the real GitPort: it shells out to git via an injected
 * ProcessRunner. The ProcessRunner seam keeps this logic unit-testable with a
 * fake; the live binding (NodeProcessRunner) is used in production.
 */
import type { GitPort } from "../ports/git.ts";
import type { ProcessRunner } from "../ports/agent.ts";

export class GitCli implements GitPort {
  constructor(
    private readonly repoRoot: string,
    private readonly runner: ProcessRunner,
  ) {}

  async worktreeAdd(issue: string, baseBranch: string): Promise<string> {
    const path = `${this.repoRoot}/.worktrees/${issue}`;
    const branchName = `diablo/${issue}`;
    
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
        throw new Error(
          `No changes to commit in ${worktree}: the step produced no file changes ` +
            `but was expected to. Check the agent actually implemented the work.`,
        );
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
}
