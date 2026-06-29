import { describe, expect, test } from "bun:test";
import { artifactIgnore, ARTIFACT_DIR } from "../src/domain/artifact-ignore.ts";

describe("artifactIgnore", () => {
  test("targets a self-ignoring .gitignore inside the worktree's artifact dir", () => {
    const { path, content } = artifactIgnore("/proj/.worktrees/billing-02");
    expect(path).toBe("/proj/.worktrees/billing-02/.plans/.gitignore");
    // A single "*" ignores everything in the dir INCLUDING the .gitignore itself,
    // so the entire .plans/ tree is uncommittable and per-worktree correct.
    expect(content.trim()).toBe("*");
  });

  test("the artifact dir is .plans (where plan/progress/design notes live)", () => {
    expect(ARTIFACT_DIR).toBe(".plans");
  });
});
