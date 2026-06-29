import { describe, expect, test } from "bun:test";
import { huskyArtifacts } from "../src/domain/husky-hooks.ts";
import { PACKAGE_MANAGERS, type PackageManager } from "../src/domain/package-manager.ts";

describe("huskyArtifacts", () => {
  test("overwrites pre-commit so it does NOT run tests (decoupled from the AFK loop)", () => {
    const a = huskyArtifacts("bun");
    const preCommit = a.find((f) => f.path === ".husky/pre-commit");
    expect(preCommit).toBeDefined();
    expect(preCommit!.content).not.toMatch(/\btest\b/);
  });

  test("wires commitlint into the commit-msg hook (not pre-commit — the message exists only there)", () => {
    const a = huskyArtifacts("bun");
    const commitMsg = a.find((f) => f.path === ".husky/commit-msg");
    expect(commitMsg).toBeDefined();
    expect(commitMsg!.content).toContain("commitlint");
    expect(commitMsg!.content).toContain("--edit");
  });

  test("uses bunx to run commitlint for the bun manager", () => {
    const commitMsg = huskyArtifacts("bun").find((f) => f.path === ".husky/commit-msg")!;
    expect(commitMsg.content).toContain("bunx commitlint");
  });

  test("uses npx for npm and `pnpm exec` for pnpm", () => {
    expect(
      huskyArtifacts("npm").find((f) => f.path === ".husky/commit-msg")!.content,
    ).toContain("npx");
    expect(
      huskyArtifacts("pnpm").find((f) => f.path === ".husky/commit-msg")!.content,
    ).toContain("pnpm exec commitlint");
  });

  test("scaffolds a commitlint config extending config-conventional (commitlint needs one)", () => {
    const config = huskyArtifacts("bun").find((f) => f.path === "commitlint.config.js");
    expect(config).toBeDefined();
    expect(config!.content).toContain("@commitlint/config-conventional");
  });

  test("every manager yields all three artifacts with non-empty content", () => {
    for (const pm of PACKAGE_MANAGERS as PackageManager[]) {
      const a = huskyArtifacts(pm);
      const paths = a.map((f) => f.path).sort();
      expect(paths).toEqual([".husky/commit-msg", ".husky/pre-commit", "commitlint.config.js"]);
      for (const f of a) expect(f.content.length).toBeGreaterThan(0);
    }
  });
});
