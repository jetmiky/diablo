import { describe, expect, test } from "bun:test";
import { decideDone } from "../src/domain/done-gate.ts";
import type { AcceptanceCriterion } from "../src/domain/acceptance.ts";

// Issue 06: key-based (normalized-text) matching, robust to reorder/reword, and
// distinguishing a genuinely empty criteria set from one that failed to parse.

describe("decideDone — key-based matching", () => {
  test("verdict not pass → needs-human regardless of criteria", () => {
    const result = decideDone("fail", [{ text: "a", checked: false }], [{ text: "a", checked: true }], {
      sectionPresent: true,
    });
    expect(result.status).toBe("needs-human");
  });

  test("matches by normalized text even when the verifier REORDERS the checklist", () => {
    const issue: AcceptanceCriterion[] = [
      { text: "Parses the config", checked: false },
      { text: "Rejects bad input", checked: false },
    ];
    // Verifier returns them in the opposite order, both checked.
    const verifier: AcceptanceCriterion[] = [
      { text: "Rejects bad input", checked: true },
      { text: "Parses the config", checked: true },
    ];
    expect(decideDone("pass", issue, verifier, { sectionPresent: true }).status).toBe("done");
  });

  test("matches despite minor wording/whitespace/case/trailing-punctuation differences", () => {
    const issue: AcceptanceCriterion[] = [{ text: "Parses the config file", checked: false }];
    const verifier: AcceptanceCriterion[] = [{ text: "  parses the   config file.  ", checked: true }];
    expect(decideDone("pass", issue, verifier, { sectionPresent: true }).status).toBe("done");
  });

  test("a reworded checklist that no longer matches an issue criterion → unmatched → needs-human", () => {
    const issue: AcceptanceCriterion[] = [{ text: "Supports pagination", checked: false }];
    const verifier: AcceptanceCriterion[] = [{ text: "Something entirely different", checked: true }];
    const result = decideDone("pass", issue, verifier, { sectionPresent: true });
    expect(result.status).toBe("needs-human");
    if (result.status === "needs-human") expect(result.unmet).toEqual(["Supports pagination"]);
  });

  test("an issue criterion matched but UNCHECKED by the verifier → unmet → needs-human", () => {
    const issue: AcceptanceCriterion[] = [
      { text: "one", checked: false },
      { text: "two", checked: false },
    ];
    const verifier: AcceptanceCriterion[] = [
      { text: "two", checked: false }, // reordered AND unchecked
      { text: "one", checked: true },
    ];
    const result = decideDone("pass", issue, verifier, { sectionPresent: true });
    expect(result.status).toBe("needs-human");
    if (result.status === "needs-human") expect(result.unmet).toEqual(["two"]);
  });

  test("extra verifier entries are ignored as long as every issue criterion is matched+checked", () => {
    const issue: AcceptanceCriterion[] = [{ text: "core works", checked: false }];
    const verifier: AcceptanceCriterion[] = [
      { text: "core works", checked: true },
      { text: "bonus thing the verifier added", checked: true },
    ];
    expect(decideDone("pass", issue, verifier, { sectionPresent: true }).status).toBe("done");
  });
});

describe("decideDone — empty vs unparseable criteria", () => {
  test("NO criteria section (trivial ticket) + pass → done (weak gate, warn-and-proceed)", () => {
    const result = decideDone("pass", [], [], { sectionPresent: false });
    expect(result.status).toBe("done");
  });

  test("criteria section PRESENT but parsed empty (malformed) + pass → needs-human", () => {
    const result = decideDone("pass", [], [], { sectionPresent: true });
    expect(result.status).toBe("needs-human");
    if (result.status === "needs-human") expect(result.reason).toMatch(/parse|malformed|could not/i);
  });

  test("back-compat: omitting opts treats empty criteria as a trivial ticket (done)", () => {
    expect(decideDone("pass", [], []).status).toBe("done");
  });
});
