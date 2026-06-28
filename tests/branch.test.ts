import { describe, expect, test } from "bun:test";
import { branchName } from "../src/domain/branch.ts";

/**
 * The work-branch name derives from the configured prefix plus the issue, so
 * an operator can group diablo branches (diablo/, feat/diablo-, ...) without
 * touching code. Pure rule, unit-tested.
 */
describe("branchName", () => {
  test("prefixes the issue with the configured prefix", () => {
    expect(branchName("diablo/", "billing-02")).toBe("diablo/billing-02");
  });

  test("supports a prefix without a trailing slash", () => {
    expect(branchName("feat/diablo-", "roast-cli")).toBe("feat/diablo-roast-cli");
  });

  test("an empty prefix yields the bare issue name", () => {
    expect(branchName("", "billing-02")).toBe("billing-02");
  });
});
