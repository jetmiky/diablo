import { describe, expect, test } from "bun:test";
import { parseVerdict, parseVerdictCategory } from "../src/domain/verdict.ts";

describe("parseVerdict", () => {
  test("reads PASS from a trailing VERDICT line", () => {
    const text = [
      "Ran bun run typecheck: clean.",
      "Ran bun test: 28 pass, 0 fail.",
      "VERDICT: PASS",
    ].join("\n");
    expect(parseVerdict(text)).toBe("pass");
  });

  test("reads FAIL from a trailing VERDICT line", () => {
    const text = [
      "typecheck reported 3 errors in src/main.test.ts.",
      "VERDICT: FAIL",
    ].join("\n");
    expect(parseVerdict(text)).toBe("fail");
  });

  test("is case-insensitive on the keyword and the verdict word", () => {
    expect(parseVerdict("verdict: pass")).toBe("pass");
    expect(parseVerdict("Verdict: Fail")).toBe("fail");
  });

  test("tolerates surrounding markdown/bold and whitespace", () => {
    expect(parseVerdict("**VERDICT: PASS**")).toBe("pass");
    expect(parseVerdict("   VERDICT:   FAIL   ")).toBe("fail");
  });

  test("uses the LAST verdict line when several appear", () => {
    const text = [
      "Earlier I thought VERDICT: PASS",
      "but after running tests:",
      "VERDICT: FAIL",
    ].join("\n");
    expect(parseVerdict(text)).toBe("fail");
  });

  test("returns 'none' when no verdict line is present", () => {
    expect(parseVerdict("Looks fine to me, acceptable.")).toBe("none");
  });

  test("returns 'none' for empty text", () => {
    expect(parseVerdict("")).toBe("none");
  });

  test("does not treat the word 'pass' in prose as a verdict", () => {
    expect(parseVerdict("All tests pass and it looks great.")).toBe("none");
  });
});

describe("parseVerdictCategory", () => {
  test("reads [implementation] from a FAIL verdict line", () => {
    expect(parseVerdictCategory("VERDICT: FAIL [implementation]")).toBe("implementation");
  });

  test("reads [plan] from a FAIL verdict line", () => {
    expect(parseVerdictCategory("the plan is wrong.\nVERDICT: FAIL [plan]")).toBe("plan");
  });

  test("is case-insensitive and tolerant of whitespace/markdown", () => {
    expect(parseVerdictCategory("**VERDICT: FAIL [Implementation]**")).toBe("implementation");
    expect(parseVerdictCategory("VERDICT:FAIL   [ PLAN ]")).toBe("plan");
  });

  test("defaults to 'implementation' when a FAIL has no category", () => {
    // The safe default: retry the worker rather than halt to a human.
    expect(parseVerdictCategory("VERDICT: FAIL")).toBe("implementation");
  });

  test("uses the LAST verdict line's category when several appear", () => {
    const text = ["VERDICT: FAIL [plan]", "on reflection:", "VERDICT: FAIL [implementation]"].join(
      "\n",
    );
    expect(parseVerdictCategory(text)).toBe("implementation");
  });

  test("returns 'implementation' for a non-FAIL or absent verdict (caller only uses it on FAIL)", () => {
    expect(parseVerdictCategory("VERDICT: PASS")).toBe("implementation");
    expect(parseVerdictCategory("no verdict here")).toBe("implementation");
  });
});
