import { describe, expect, test } from "bun:test";
import { GitCli } from "../src/adapters/git-cli.ts";
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
});
