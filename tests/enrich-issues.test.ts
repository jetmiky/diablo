import { describe, expect, test } from "bun:test";
import { enrichIssues, type EnrichIssuesDeps, type EnrichIssuesOpts } from "../src/app/enrich-issues.ts";
import type { FsPort } from "../src/ports/fs.ts";
import type { GitMergePort } from "../src/ports/git-merge.ts";

class FakeFs implements FsPort {
  files = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }
  read(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
    return Promise.resolve(v);
  }
  write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }
  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
}

class FakeGitMerge implements GitMergePort {
  calls: Array<{ branch: string; targetBranch: string }> = [];
  private mergedBranches = new Set<string>();
  private unknownBranches = new Set<string>();

  constructor(opts?: { merged?: string[]; unknown?: string[] }) {
    if (opts?.merged) opts.merged.forEach((b) => this.mergedBranches.add(b));
    if (opts?.unknown) opts.unknown.forEach((b) => this.unknownBranches.add(b));
  }

  merge(): Promise<{ ok: true }> {
    throw new Error("merge not used by enrich-issues");
  }

  isMerged(branch: string, targetBranch: string): Promise<boolean> {
    this.calls.push({ branch, targetBranch });
    if (this.unknownBranches.has(branch)) {
      return Promise.reject(new Error(`unknown ref: ${branch}`));
    }
    return Promise.resolve(this.mergedBranches.has(branch));
  }
}

function deps(fs: FsPort, git: GitMergePort): EnrichIssuesDeps {
  return { fs, git };
}

const opts: EnrichIssuesOpts = {
  issues: [],
  diabloDir: ".diablo",
  targetBranch: "main",
  branchPrefix: "diablo/",
};

describe("enrichIssues", () => {
  test("enriches a done+merged issue with merged=true", async () => {
    const fs = new FakeFs({
      ".diablo/billing-02/state.json": JSON.stringify({ status: "done" }),
    });
    const git = new FakeGitMerge({ merged: ["diablo/billing-02"] });

    const rows = await enrichIssues(deps(fs, git), {
      ...opts,
      issues: ["billing-02"],
    });

    expect(rows).toEqual([
      { issue: "billing-02", status: "done", merged: true },
    ]);
    expect(git.calls).toEqual([
      { branch: "diablo/billing-02", targetBranch: "main" },
    ]);
  });

  test("enriches a done issue whose branch is unknown with merged=false (no crash)", async () => {
    const fs = new FakeFs({
      ".diablo/billing-02/state.json": JSON.stringify({ status: "done" }),
    });
    const git = new FakeGitMerge({ unknown: ["diablo/billing-02"] });

    const rows = await enrichIssues(deps(fs, git), {
      ...opts,
      issues: ["billing-02"],
    });

    expect(rows).toEqual([
      { issue: "billing-02", status: "done", merged: false },
    ]);
    expect(git.calls).toHaveLength(1);
  });

  test("enriches a non-done issue with merged=false and does NOT call isMerged", async () => {
    const fs = new FakeFs({
      ".diablo/billing-02/state.json": JSON.stringify({ status: "open" }),
    });
    const git = new FakeGitMerge();

    const rows = await enrichIssues(deps(fs, git), {
      ...opts,
      issues: ["billing-02"],
    });

    expect(rows).toEqual([
      { issue: "billing-02", status: "open", merged: false },
    ]);
    expect(git.calls).toHaveLength(0);
  });

  test("preserves input order", async () => {
    const fs = new FakeFs({
      ".diablo/auth-03/state.json": JSON.stringify({ status: "planned" }),
      ".diablo/billing-02/state.json": JSON.stringify({ status: "open" }),
      ".diablo/cache-01/state.json": JSON.stringify({ status: "in-progress" }),
    });
    const git = new FakeGitMerge();

    const rows = await enrichIssues(deps(fs, git), {
      ...opts,
      issues: ["cache-01", "billing-02", "auth-03"],
    });

    expect(rows.map((r) => r.issue)).toEqual(["cache-01", "billing-02", "auth-03"]);
  });

  test("defaults status to open when no state file exists", async () => {
    const fs = new FakeFs(); // no state files
    const git = new FakeGitMerge();

    const rows = await enrichIssues(deps(fs, git), {
      ...opts,
      issues: ["billing-02"],
    });

    expect(rows).toEqual([
      { issue: "billing-02", status: "open", merged: false },
    ]);
  });

  test("enriches multiple issues with mixed statuses", async () => {
    const fs = new FakeFs({
      ".diablo/billing-02/state.json": JSON.stringify({ status: "done" }),
      ".diablo/auth-03/state.json": JSON.stringify({ status: "planned" }),
    });
    const git = new FakeGitMerge({ merged: ["diablo/billing-02"] });

    const rows = await enrichIssues(deps(fs, git), {
      ...opts,
      issues: ["billing-02", "auth-03"],
    });

    expect(rows).toEqual([
      { issue: "billing-02", status: "done", merged: true },
      { issue: "auth-03", status: "planned", merged: false },
    ]);
    // Only billing-02 is done, so only one isMerged call
    expect(git.calls).toHaveLength(1);
  });
});
