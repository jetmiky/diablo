import { describe, expect, test } from "bun:test";
import { parseVerdict } from "../src/domain/verdict.ts";

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
