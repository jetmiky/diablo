import { describe, expect, test } from "bun:test";
import { GitCli } from "../src/adapters/git-cli.ts";
import { NoChangesToCommitError } from "../src/ports/git.ts";
import type { ProcessOutcome, ProcessRunner } from "../src/ports/agent.ts";

class FakeRunner implements ProcessRunner {
  calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  private outcomes: ProcessOutcome[];
  
  constructor(outcomes: ProcessOutcome | ProcessOutcome[]) {
    this.outcomes = Array.isArray(outcomes) ? outcomes : [outcomes];
  }
  
  run(command: string, args: string[], cwd: string): Promise<ProcessOutcome> {
    this.calls.push({ command, args, cwd });
    const outcome = this.outcomes.shift();
    if (!outcome) {
      throw new Error("FakeRunner: no more queued outcomes");
    }
    return Promise.resolve(outcome);
  }

  // GitCli never runs interactively — git plumbing is always captured. Present
  // only to satisfy the ProcessRunner contract; a call here is a wiring bug.
  runInteractive(): Promise<ProcessOutcome> {
    throw new Error("FakeRunner: runInteractive must not be used by GitCli");
  }
}

describe("GitCli", () => {
  test("worktreeAdd creates a worktree at .worktrees/<issue> on branch diablo/<issue>", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "", exitCode: 0 });
    const git = new GitCli("/proj", runner);
    
    const path = await git.worktreeAdd("billing-02", "main");
    
    expect(path).toBe("/proj/.worktrees/billing-02");
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.command).toBe("git");
    expect(runner.calls[0]!.args).toEqual([
      "worktree",
      "add",
      "-b",
      "diablo/billing-02",
      "/proj/.worktrees/billing-02",
      "main",
    ]);
    expect(runner.calls[0]!.cwd).toBe("/proj");
  });

  test("worktreeAdd throws on non-zero exit, including stderr", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "fatal: 'main' is not a commit", exitCode: 128 });
    const git = new GitCli("/proj", runner);
    
    await expect(git.worktreeAdd("billing-02", "main")).rejects.toThrow(
      /code 128.*fatal: 'main' is not a commit/s
    );
  });

  test("commit stages all changes, commits, and returns the SHA", async () => {
    const runner = new FakeRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // git add -A
      { stdout: "", stderr: "", exitCode: 0 }, // git commit
      { stdout: "a1b2c3d4e5f6789012345678901234567890abcd\n", stderr: "", exitCode: 0 }, // git rev-parse HEAD
    ]);
    const git = new GitCli("/proj", runner);
    
    const sha = await git.commit("/proj/.worktrees/billing-02", "feat: add billing");
    
    expect(sha).toBe("a1b2c3d4e5f6789012345678901234567890abcd");
    expect(runner.calls).toHaveLength(3);
    
    expect(runner.calls[0]!.command).toBe("git");
    expect(runner.calls[0]!.args).toEqual(["add", "-A"]);
    expect(runner.calls[0]!.cwd).toBe("/proj/.worktrees/billing-02");
    
    expect(runner.calls[1]!.command).toBe("git");
    expect(runner.calls[1]!.args).toEqual(["commit", "-m", "feat: add billing"]);
    expect(runner.calls[1]!.cwd).toBe("/proj/.worktrees/billing-02");
    
    expect(runner.calls[2]!.command).toBe("git");
    expect(runner.calls[2]!.args).toEqual(["rev-parse", "HEAD"]);
    expect(runner.calls[2]!.cwd).toBe("/proj/.worktrees/billing-02");
  });

  test("commit throws on git add failure", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "error: pathspec 'bad' did not match", exitCode: 1 });
    const git = new GitCli("/proj", runner);
    
    await expect(git.commit("/proj/.worktrees/billing-02", "msg")).rejects.toThrow(
      /git add -A failed.*code 1/s
    );
  });

  test("commit gives a clear 'no changes' error when the worker produced nothing", async () => {
    // git prints "nothing to commit" on STDOUT and exits non-zero; surface a
    // typed NoChangesToCommitError so callers can defer to the verifier rather
    // than aborting the whole pipeline.
    const runner = new FakeRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // git add -A
      { stdout: "On branch x\nnothing to commit, working tree clean", stderr: "", exitCode: 1 },
    ]);
    const git = new GitCli("/proj", runner);

    await expect(git.commit("/proj/.worktrees/billing-02", "msg")).rejects.toThrow(
      NoChangesToCommitError,
    );
  });

  test("headSha returns the current HEAD SHA", async () => {
    const runner = new FakeRunner({ stdout: "b2c3d4e5f67890123456789012345678901234ab\n", stderr: "", exitCode: 0 });
    const git = new GitCli("/proj", runner);
    
    const sha = await git.headSha("/proj/.worktrees/billing-02");
    
    expect(sha).toBe("b2c3d4e5f67890123456789012345678901234ab");
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.command).toBe("git");
    expect(runner.calls[0]!.args).toEqual(["rev-parse", "HEAD"]);
    expect(runner.calls[0]!.cwd).toBe("/proj/.worktrees/billing-02");
  });

  test("diffStat returns the diff --stat output", async () => {
    const statOutput = " src/billing.ts | 10 ++++++++++\n 1 file changed, 10 insertions(+)";
    const runner = new FakeRunner({ stdout: statOutput, stderr: "", exitCode: 0 });
    const git = new GitCli("/proj", runner);
    
    const stat = await git.diffStat("/proj/.worktrees/billing-02", "main");
    
    expect(stat).toBe(statOutput);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.command).toBe("git");
    expect(runner.calls[0]!.args).toEqual(["diff", "--stat", "main"]);
    expect(runner.calls[0]!.cwd).toBe("/proj/.worktrees/billing-02");
  });

  test("diffStat throws on non-zero exit", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "fatal: bad revision 'main'", exitCode: 128 });
    const git = new GitCli("/proj", runner);
    
    await expect(git.diffStat("/proj/.worktrees/billing-02", "main")).rejects.toThrow(
      /code 128.*bad revision/s
    );
  });

  test("committedFiles lists the files a commit touched (diff-tree, handles root)", async () => {
    const runner = new FakeRunner({ stdout: "src/a.ts\nsrc/b.ts\ntests/a.test.ts\n", stderr: "", exitCode: 0 });
    const git = new GitCli("/proj", runner);

    const files = await git.committedFiles("/proj/.worktrees/billing-02", "abc123");

    expect(files).toEqual(["src/a.ts", "src/b.ts", "tests/a.test.ts"]);
    expect(runner.calls[0]!.command).toBe("git");
    expect(runner.calls[0]!.args).toEqual(["diff-tree", "--no-commit-id", "--name-only", "-r", "abc123"]);
    expect(runner.calls[0]!.cwd).toBe("/proj/.worktrees/billing-02");
  });

  test("committedFiles drops blank lines and trims", async () => {
    const runner = new FakeRunner({ stdout: "  src/a.ts  \n\n\nsrc/b.ts\n", stderr: "", exitCode: 0 });
    const git = new GitCli("/proj", runner);

    expect(await git.committedFiles("/proj/.worktrees/x", "sha")).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("committedFiles throws on non-zero exit", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "fatal: bad object", exitCode: 128 });
    const git = new GitCli("/proj", runner);

    await expect(git.committedFiles("/proj/.worktrees/x", "sha")).rejects.toThrow(
      /code 128.*bad object/s,
    );
  });

  test("worktreeAdd uses the configured branch name when given", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "", exitCode: 0 });
    const git = new GitCli("/proj", runner);

    await git.worktreeAdd("billing-02", "main", "feat/diablo-billing-02");

    expect(runner.calls[0]!.args).toEqual([
      "worktree",
      "add",
      "-b",
      "feat/diablo-billing-02",
      "/proj/.worktrees/billing-02",
      "main",
    ]);
  });

  test("worktreeAdd defaults to diablo/<issue> when no branch is given (back-compat)", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "", exitCode: 0 });
    const git = new GitCli("/proj", runner);

    await git.worktreeAdd("billing-02", "main");

    expect(runner.calls[0]!.args[3]).toBe("diablo/billing-02");
  });
});

describe("GitCli merge", () => {
  test("clean merge: checks out target, merges --no-ff, returns ok", async () => {
    const runner = new FakeRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // git checkout main
      { stdout: "Merge made by the 'ort' strategy.", stderr: "", exitCode: 0 }, // git merge
    ]);
    const git = new GitCli("/proj", runner);

    const result = await git.merge("main", "diablo/billing-02");

    expect(result.ok).toBe(true);
    expect(runner.calls[0]!.args).toEqual(["checkout", "main"]);
    expect(runner.calls[0]!.cwd).toBe("/proj"); // primary working copy, not a worktree
    expect(runner.calls[1]!.args).toEqual(["merge", "--no-ff", "diablo/billing-02"]);
    expect(runner.calls[1]!.cwd).toBe("/proj");
  });

  test("conflict: aborts the merge cleanly and returns the conflicting files", async () => {
    const runner = new FakeRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // git checkout main
      { stdout: "CONFLICT (content): Merge conflict in src/a.ts", stderr: "", exitCode: 1 }, // git merge fails
      { stdout: "src/a.ts\nsrc/b.ts\n", stderr: "", exitCode: 0 }, // git diff --name-only --diff-filter=U
      { stdout: "", stderr: "", exitCode: 0 }, // git merge --abort
    ]);
    const git = new GitCli("/proj", runner);

    const result = await git.merge("main", "diablo/billing-02");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts).toEqual(["src/a.ts", "src/b.ts"]);
    }
    // The merge must be aborted — nothing left half-merged, nothing auto-resolved.
    const abort = runner.calls.find((c) => c.args.join(" ") === "merge --abort");
    expect(abort).toBeDefined();
    expect(abort!.cwd).toBe("/proj");
  });

  test("merge throws if the target branch cannot be checked out", async () => {
    const runner = new FakeRunner([
      { stdout: "", stderr: "error: pathspec 'main' did not match", exitCode: 1 },
    ]);
    const git = new GitCli("/proj", runner);

    await expect(git.merge("main", "diablo/billing-02")).rejects.toThrow(/checkout.*main/s);
  });
});

describe("GitCli isMerged", () => {
  test("returns true when branch is merged (exitCode 0)", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "", exitCode: 0 });
    const git = new GitCli("/proj", runner);

    const result = await git.isMerged("diablo/billing-02", "main");

    expect(result).toBe(true);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.command).toBe("git");
    expect(runner.calls[0]!.args).toEqual(["merge-base", "--is-ancestor", "diablo/billing-02", "main"]);
    expect(runner.calls[0]!.cwd).toBe("/proj");
  });

  test("returns false when branch is not merged (exitCode 1)", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "", exitCode: 1 });
    const git = new GitCli("/proj", runner);

    const result = await git.isMerged("diablo/billing-02", "main");

    expect(result).toBe(false);
    expect(runner.calls[0]!.args).toEqual(["merge-base", "--is-ancestor", "diablo/billing-02", "main"]);
  });

  test("throws on unknown ref (other non-zero exitCode)", async () => {
    const runner = new FakeRunner({
      stdout: "",
      stderr: "fatal: Not a valid object name diablo/unknown",
      exitCode: 128,
    });
    const git = new GitCli("/proj", runner);

    await expect(git.isMerged("diablo/unknown", "main")).rejects.toThrow(
      /fatal: Not a valid object name/,
    );
  });

  test("runs in repoRoot, not a worktree", async () => {
    const runner = new FakeRunner({ stdout: "", stderr: "", exitCode: 0 });
    const git = new GitCli("/custom/repo", runner);

    await git.isMerged("feat/x", "develop");

    expect(runner.calls[0]!.cwd).toBe("/custom/repo");
  });
});
