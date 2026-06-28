import { describe, expect, test } from "bun:test";
import { resolveSkillsDir, skillFile } from "../src/domain/skills-path.ts";

/**
 * The vendored skills ship inside the diablo package, so their location must be
 * derived from the module's OWN path (anchored to import.meta.url at the call
 * site), never the target project's cwd. These tests pin the pure walk-up rule
 * with an injected directory predicate, so no real filesystem is touched.
 */
describe("resolveSkillsDir", () => {
  test("returns the skills/ dir found beside the start directory", () => {
    // dev layout: module in <root>/src/cli, skills in <root>/skills
    const exists = (p: string) => p === "/repo/skills";
    expect(resolveSkillsDir("/repo/src/cli", exists)).toBe("/repo/skills");
  });

  test("walks up one level to find skills/ (built layout: dist/ beside skills/)", () => {
    // built layout: module in <root>/dist, skills in <root>/skills
    const exists = (p: string) => p === "/pkg/skills";
    expect(resolveSkillsDir("/pkg/dist", exists)).toBe("/pkg/skills");
  });

  test("walks up multiple levels until a skills/ dir exists", () => {
    const exists = (p: string) => p === "/a/skills";
    expect(resolveSkillsDir("/a/b/c/d", exists)).toBe("/a/skills");
  });

  test("prefers the nearest skills/ dir when several ancestors have one", () => {
    const exists = (p: string) => p === "/a/skills" || p === "/a/b/skills";
    expect(resolveSkillsDir("/a/b/c", exists)).toBe("/a/b/skills");
  });

  test("throws a clear error when no ancestor has a skills/ dir", () => {
    const exists = () => false;
    expect(() => resolveSkillsDir("/a/b/c", exists)).toThrow(/skills.*not.*found/i);
  });
});

describe("skillFile", () => {
  test("builds the SKILL.md path for a named skill under the skills dir", () => {
    expect(skillFile("/repo/skills", "master-plan")).toBe("/repo/skills/master-plan/SKILL.md");
  });

  test("joins without a double slash when the skills dir has a trailing slash", () => {
    expect(skillFile("/repo/skills/", "tdd")).toBe("/repo/skills/tdd/SKILL.md");
  });
});
