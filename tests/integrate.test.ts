import { describe, expect, test } from "bun:test";
import { integrate, type IntegrateDeps } from "../src/app/integrate.ts";
import type { GitMergePort, MergeResult } from "../src/ports/git-merge.ts";

class FakeMerge implements GitMergePort {
  calls: Array<{ targetBranch: string; branch: string }> = [];
  constructor(private result: MergeResult) {}
  merge(targetBranch: string, branch: string): Promise<MergeResult> {
    this.calls.push({ targetBranch, branch });
    return Promise.resolve(this.result);
  }
}

function deps(git: GitMergePort): IntegrateDeps {
  return { git };
}

const base = { branch: "diablo/billing-02", targetBranch: "main" };

describe("integrate", () => {
  test("autoMerge off (default): leaves the branch and returns the manual merge command, never merges", async () => {
    const git = new FakeMerge({ ok: true });
    const out = await integrate(deps(git), { ...base, autoMerge: false });

    expect(out.status).toBe("manual");
    expect(git.calls).toHaveLength(0); // nothing merged
    if (out.status === "manual") {
      expect(out.command).toContain("main");
      expect(out.command).toContain("diablo/billing-02");
    }
  });

  test("autoMerge on + clean merge: integrates into the target branch", async () => {
    const git = new FakeMerge({ ok: true });
    const out = await integrate(deps(git), { ...base, autoMerge: true });

    expect(out.status).toBe("merged");
    expect(git.calls).toEqual([{ targetBranch: "main", branch: "diablo/billing-02" }]);
  });

  test("autoMerge on + conflict: reports conflicting files and the manual command, nothing auto-resolved", async () => {
    const git = new FakeMerge({ ok: false, conflicts: ["src/a.ts", "src/b.ts"] });
    const out = await integrate(deps(git), { ...base, autoMerge: true });

    expect(out.status).toBe("conflict");
    if (out.status === "conflict") {
      expect(out.conflicts).toEqual(["src/a.ts", "src/b.ts"]);
      expect(out.command).toContain("diablo/billing-02");
    }
  });

  test("the merge targets the configured target branch", async () => {
    const git = new FakeMerge({ ok: true });
    await integrate(deps(git), { branch: "diablo/x", targetBranch: "develop", autoMerge: true });
    expect(git.calls[0]).toEqual({ targetBranch: "develop", branch: "diablo/x" });
  });
});
