import { describe, expect, test } from "bun:test";
import { isNothingToCheck } from "../src/domain/empty-gate-state.ts";

describe("isNothingToCheck", () => {
  test("tsc TS18003 'no inputs' is a nothing-to-check state", () => {
    const output =
      "error TS18003: No inputs were found in config file '/p/tsconfig.json'. " +
      `Specified 'include' paths were '["**/*"]' and 'exclude' paths were '[]'.`;
    expect(isNothingToCheck(output)).toBe(true);
  });

  test("bun's 'No tests found!' (empty suite) is a nothing-to-check state", () => {
    const output = "bun test v1.3.13\nNo tests found!\nTests need \".test\" ...";
    expect(isNothingToCheck(output)).toBe(true);
  });

  test("a real type error is NOT nothing-to-check (must still FAIL)", () => {
    const output = "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    expect(isNothingToCheck(output)).toBe(false);
  });

  test("TS18003 alongside a real type error is NOT masked (defensive: other TS error present)", () => {
    const output =
      "error TS18003: No inputs were found.\n" +
      "src/a.ts(3,5): error TS2322: Type mismatch.";
    expect(isNothingToCheck(output)).toBe(false);
  });

  test("a genuinely failing test is NOT nothing-to-check", () => {
    const output = "1 fail\n0 pass\nexpect(received).toBe(expected)";
    expect(isNothingToCheck(output)).toBe(false);
  });

  test("undefined / empty output is not nothing-to-check (no evidence of an empty state)", () => {
    expect(isNothingToCheck(undefined)).toBe(false);
    expect(isNothingToCheck("")).toBe(false);
  });
});
