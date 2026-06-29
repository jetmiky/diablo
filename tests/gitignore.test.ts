import { describe, expect, test } from "bun:test";
import { mergeGitignore } from "../src/domain/gitignore.ts";

describe("mergeGitignore", () => {
  test("creates a managed block with diablo runtime dirs when no file exists (brownfield)", () => {
    const result = mergeGitignore(null, false);
    expect(result).not.toBeNull();
    expect(result!).toContain(".diablo/");
    expect(result!).toContain(".worktrees/");
  });

  test("greenfield also seeds common project ignores (node_modules, dist, env)", () => {
    const result = mergeGitignore(null, true);
    expect(result!).toContain("node_modules/");
    expect(result!).toContain("dist/");
    expect(result!).toContain(".env");
  });

  test("brownfield contributes ONLY diablo runtime dirs, not project ignores", () => {
    const result = mergeGitignore(null, false);
    expect(result!).not.toContain("node_modules/");
    expect(result!).not.toContain("dist/");
  });

  test("does not track .scratch/ — the issue tracker is version-controlled in user projects", () => {
    expect(mergeGitignore(null, true)!).not.toContain(".scratch/");
    expect(mergeGitignore(null, false)!).not.toContain(".scratch/");
  });

  test("appends the managed block to an existing .gitignore, preserving its content", () => {
    const existing = "node_modules/\ncustom-secret.key\n";
    const result = mergeGitignore(existing, false);
    expect(result!).toContain("custom-secret.key");
    expect(result!).toContain(".diablo/");
    expect(result!).toContain(".worktrees/");
  });

  test("is idempotent — re-running on a file that already has the managed block is a no-op", () => {
    const first = mergeGitignore("node_modules/\n", false)!;
    const second = mergeGitignore(first, false);
    expect(second).toBeNull();
  });

  test("never seeds greenfield entries when a .gitignore already exists (it is not greenfield)", () => {
    // An existing .gitignore means the project already has conventions; only
    // the diablo runtime block is contributed regardless of the flag.
    const result = mergeGitignore("# project\n", true);
    expect(result!).not.toContain("node_modules/");
    expect(result!).toContain(".diablo/");
  });
});
