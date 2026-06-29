import { describe, expect, test } from "bun:test";
import { finalizeIssue, type FinalizeIssueDeps, type FinalizeIssueOpts } from "../src/app/finalize-issue.ts";
import { readStatus } from "../src/app/issue-status-store.ts";
import type { FsPort } from "../src/ports/fs.ts";

// In-memory fs seeded with optional initial files.
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

describe("finalizeIssue", () => {
  test("PASS with all criteria checked returns done and flips boxes to [x]", async () => {
    const issueMarkdown = `
## Description

Fix the billing bug.

## Acceptance criteria

- [ ] bug is fixed
- [ ] tests pass
`;
    const verifierText = `
Ran the tests, all pass.

CRITERIA:

- [x] bug is fixed — test_billing.test.ts passes
- [x] tests pass — bun test reports 0 failures

VERDICT: PASS
`;
    
    const fs = new FakeFs({
      "/issues/billing-02.md": issueMarkdown,
    });
    const deps: FinalizeIssueDeps = { fs };
    const opts: FinalizeIssueOpts = {
      issuePath: "/issues/billing-02.md",
      diabloDir: ".diablo",
      issue: "billing-02",
      verdict: "pass",
      verifierText,
    };
    
    const decision = await finalizeIssue(deps, opts);
    
    expect(decision.status).toBe("done");
    
    // File boxes should be flipped to [x]
    const updated = await fs.read("/issues/billing-02.md");
    expect(updated).toContain("- [x] bug is fixed");
    expect(updated).toContain("- [x] tests pass");
    
    // State should be persisted
    const status = await readStatus({ fs }, { diabloDir: ".diablo", issue: "billing-02" });
    expect(status).toBe("done");
  });

  test("unmet criterion returns needs-human and leaves boxes unchanged", async () => {
    const issueMarkdown = `
## Acceptance criteria

- [ ] bug is fixed
- [ ] tests pass
`;
    const verifierText = `
CRITERIA:

- [x] bug is fixed — test_billing.test.ts passes
- [ ] tests pass — 2 tests still failing

VERDICT: PASS
`;
    
    const fs = new FakeFs({
      "/issues/billing-02.md": issueMarkdown,
    });
    const deps: FinalizeIssueDeps = { fs };
    const opts: FinalizeIssueOpts = {
      issuePath: "/issues/billing-02.md",
      diabloDir: ".diablo",
      issue: "billing-02",
      verdict: "pass",
      verifierText,
    };
    
    const decision = await finalizeIssue(deps, opts);
    
    expect(decision.status).toBe("needs-human");
    if (decision.status === "needs-human") {
      expect(decision.unmet).toEqual(["tests pass"]);
    }
    
    // File boxes should NOT be flipped
    const updated = await fs.read("/issues/billing-02.md");
    expect(updated).toContain("- [ ] bug is fixed");
    expect(updated).toContain("- [ ] tests pass");
    
    // State should be needs-human
    const status = await readStatus({ fs }, { diabloDir: ".diablo", issue: "billing-02" });
    expect(status).toBe("needs-human");
  });

  test("FAIL verdict returns needs-human", async () => {
    const issueMarkdown = `
## Acceptance criteria

- [ ] bug is fixed
`;
    const verifierText = `
Tests are failing.

VERDICT: FAIL
`;
    
    const fs = new FakeFs({
      "/issues/billing-02.md": issueMarkdown,
    });
    const deps: FinalizeIssueDeps = { fs };
    const opts: FinalizeIssueOpts = {
      issuePath: "/issues/billing-02.md",
      diabloDir: ".diablo",
      issue: "billing-02",
      verdict: "fail",
      verifierText,
    };
    
    const decision = await finalizeIssue(deps, opts);
    
    expect(decision.status).toBe("needs-human");
    if (decision.status === "needs-human") {
      expect(decision.reason).toBe("final verification did not pass");
    }
    
    // State should be needs-human
    const status = await readStatus({ fs }, { diabloDir: ".diablo", issue: "billing-02" });
    expect(status).toBe("needs-human");
  });

  test("no-criteria issue with PASS returns done (no file rewrite)", async () => {
    const issueMarkdown = `
## Description

Simple refactor with no explicit criteria.
`;
    const verifierText = `
Looks good!

VERDICT: PASS
`;
    
    const fs = new FakeFs({
      "/issues/refactor-01.md": issueMarkdown,
    });
    const deps: FinalizeIssueDeps = { fs };
    const opts: FinalizeIssueOpts = {
      issuePath: "/issues/refactor-01.md",
      diabloDir: ".diablo",
      issue: "refactor-01",
      verdict: "pass",
      verifierText,
    };
    
    const decision = await finalizeIssue(deps, opts);
    
    expect(decision.status).toBe("done");
    
    // File should be unchanged (no criteria to flip)
    const updated = await fs.read("/issues/refactor-01.md");
    expect(updated).toBe(issueMarkdown);
    
    // State should be done
    const status = await readStatus({ fs }, { diabloDir: ".diablo", issue: "refactor-01" });
    expect(status).toBe("done");
  });
});
