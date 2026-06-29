import { test, expect, describe } from "bun:test";
import { cleanIssue, type CleanIssueDeps, type CleanIssueOpts } from "../src/app/clean-issue.ts";
import type { FsPort } from "../src/ports/fs.ts";

// A fake fs whose existence set is controlled per-test.
function fakeFs(existing: Set<string>): FsPort {
  return {
    async read() {
      throw new Error("not used");
    },
    async write() {
      throw new Error("not used");
    },
    async exists(path: string) {
      return existing.has(path);
    },
  };
}

// Records the git/merge calls the use-case makes against the seam.
function recorder(opts: { merged: boolean }) {
  const calls: string[] = [];
  const deps: CleanIssueDeps = {
    fs: fakeFs(new Set(["/repo/.worktrees/feat-x"])),
    git: {
      async worktreeRemove(worktree, force) {
        calls.push(`remove ${worktree} force=${force}`);
      },
      async branchDelete(branch, force) {
        calls.push(`branch-delete ${branch} force=${force}`);
      },
    },
    merge: {
      async isMerged(branch, targetBranch) {
        calls.push(`is-merged ${branch} into ${targetBranch}`);
        return opts.merged;
      },
    },
  };
  return { deps, calls };
}

const base: CleanIssueOpts = {
  issue: "feat-x",
  worktree: "/repo/.worktrees/feat-x",
  branch: "diablo/feat-x",
  targetBranch: "main",
  deleteBranch: true,
  force: false,
};

describe("cleanIssue", () => {
  test("a merged issue: removes the worktree and deletes the branch", async () => {
    const { deps, calls } = recorder({ merged: true });
    const result = await cleanIssue(deps, base);

    expect(result.status).toBe("cleaned");
    if (result.status === "cleaned") {
      expect(result.removedWorktree).toBe(true);
      expect(result.deletedBranch).toBe(true);
    }
    expect(calls).toEqual([
      "is-merged diablo/feat-x into main",
      "remove /repo/.worktrees/feat-x force=false",
      "branch-delete diablo/feat-x force=false",
    ]);
  });

  test("an UNMERGED branch without force: refuses, touching nothing", async () => {
    const { deps, calls } = recorder({ merged: false });
    const result = await cleanIssue(deps, base);

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.reason).toContain("not merged");
    }
    // Only the merge check ran — no destructive call.
    expect(calls).toEqual(["is-merged diablo/feat-x into main"]);
  });

  test("an UNMERGED branch WITH force: removes anyway, force-deleting the branch", async () => {
    const { deps, calls } = recorder({ merged: false });
    const result = await cleanIssue(deps, { ...base, force: true });

    expect(result.status).toBe("cleaned");
    // force skips the guard and force-deletes the unmerged branch (-D).
    expect(calls).toEqual([
      "remove /repo/.worktrees/feat-x force=true",
      "branch-delete diablo/feat-x force=true",
    ]);
  });

  test("deleteBranch=false: removes the worktree but keeps the branch", async () => {
    const { deps, calls } = recorder({ merged: true });
    const result = await cleanIssue(deps, { ...base, deleteBranch: false });

    expect(result.status).toBe("cleaned");
    if (result.status === "cleaned") expect(result.deletedBranch).toBe(false);
    expect(calls).toEqual([
      "is-merged diablo/feat-x into main",
      "remove /repo/.worktrees/feat-x force=false",
    ]);
  });

  test("no worktree on disk: nothing to clean (idempotent), never calls git", async () => {
    const { deps, calls } = recorder({ merged: true });
    deps.fs = fakeFs(new Set()); // worktree absent
    const result = await cleanIssue(deps, base);

    expect(result.status).toBe("nothing");
    expect(calls).toEqual([]);
  });

  test("force on a merged branch still uses -d semantics surfaced as force=true (caller decides)", async () => {
    // With force, the guard is skipped entirely — we never even ask isMerged.
    const { deps, calls } = recorder({ merged: true });
    await cleanIssue(deps, { ...base, force: true });
    expect(calls.some((c) => c.startsWith("is-merged"))).toBe(false);
  });
});
