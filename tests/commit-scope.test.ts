import { describe, expect, test } from "bun:test";
import { outOfScopeFiles } from "../src/domain/commit-scope.ts";

describe("outOfScopeFiles", () => {
  test("returns nothing when every committed file is a declared target", () => {
    const declared = ["src/a.ts", "src/b.ts"];
    const committed = ["src/a.ts", "src/b.ts"];
    expect(outOfScopeFiles(declared, committed)).toEqual([]);
  });

  test("flags a committed file that is not a declared target", () => {
    const declared = ["src/a.ts"];
    const committed = ["src/a.ts", "src/sneaky.ts"];
    expect(outOfScopeFiles(declared, committed)).toEqual(["src/sneaky.ts"]);
  });

  test("test files are always in scope (TDD writes tests alongside the target)", () => {
    const declared = ["src/roman.ts"];
    const committed = [
      "src/roman.ts",
      "tests/roman.test.ts", // tests/ dir
      "src/roman.spec.ts", // .spec.
      "src/foo.test.ts", // .test.
    ];
    expect(outOfScopeFiles(declared, committed)).toEqual([]);
  });

  test("a stray non-test file is flagged even when test files are also present", () => {
    const declared = ["src/a.ts"];
    const committed = ["src/a.ts", "tests/a.test.ts", "src/debug-dump.json"];
    expect(outOfScopeFiles(declared, committed)).toEqual(["src/debug-dump.json"]);
  });

  test("no declared targets → nothing is enforceable, so nothing is flagged (warn-not-block)", () => {
    // An empty declared set means the plan gave no Target Files to scope against;
    // we cannot meaningfully flag strays, so we stay silent rather than warn on
    // everything. (The .plans/ hard-exclusion is handled separately by 02A.)
    expect(outOfScopeFiles([], ["src/a.ts", "src/b.ts"])).toEqual([]);
  });

  test("ignores empty / whitespace entries in either list", () => {
    expect(outOfScopeFiles([" src/a.ts ", ""], ["src/a.ts", "  "])).toEqual([]);
  });

  test("preserves the order strays were committed in and de-duplicates", () => {
    const declared = ["src/a.ts"];
    const committed = ["src/z.ts", "src/a.ts", "src/z.ts", "src/m.ts"];
    expect(outOfScopeFiles(declared, committed)).toEqual(["src/z.ts", "src/m.ts"]);
  });
});
