import { describe, expect, test } from "bun:test";
import { decideDone, type DoneDecision } from "../src/domain/done-gate.ts";
import type { Verdict } from "../src/domain/verdict.ts";
import type { AcceptanceCriterion } from "../src/domain/acceptance.ts";

describe("decideDone", () => {
  test("verdict not pass returns needs-human", () => {
    const issueCriteria: AcceptanceCriterion[] = [
      { text: "criterion one", checked: false },
    ];
    const verifierResults: AcceptanceCriterion[] = [
      { text: "criterion one", checked: true },
    ];
    
    const result = decideDone("fail", issueCriteria, verifierResults);
    
    expect(result.status).toBe("needs-human");
    if (result.status === "needs-human") {
      expect(result.reason).toBe("final verification did not pass");
      expect(result.unmet).toEqual([]);
    }
  });

  test("verdict pass with empty criteria returns done (weak gate)", () => {
    const result = decideDone("pass", [], []);
    
    expect(result.status).toBe("done");
  });

  test("verdict pass with count mismatch returns needs-human", () => {
    const issueCriteria: AcceptanceCriterion[] = [
      { text: "criterion one", checked: false },
      { text: "criterion two", checked: false },
    ];
    const verifierResults: AcceptanceCriterion[] = [
      { text: "criterion one", checked: true },
    ];
    
    const result = decideDone("pass", issueCriteria, verifierResults);
    
    expect(result.status).toBe("needs-human");
    if (result.status === "needs-human") {
      expect(result.reason).toBe("the verifier did not address every acceptance criterion");
      expect(result.unmet).toEqual(["criterion one", "criterion two"]);
    }
  });

  test("verdict pass with all criteria met returns done", () => {
    const issueCriteria: AcceptanceCriterion[] = [
      { text: "criterion one", checked: false },
      { text: "criterion two", checked: false },
    ];
    const verifierResults: AcceptanceCriterion[] = [
      { text: "criterion one", checked: true },
      { text: "criterion two", checked: true },
    ];
    
    const result = decideDone("pass", issueCriteria, verifierResults);
    
    expect(result.status).toBe("done");
  });

  test("verdict pass with some criteria unmet returns needs-human", () => {
    const issueCriteria: AcceptanceCriterion[] = [
      { text: "criterion one", checked: false },
      { text: "criterion two", checked: false },
      { text: "criterion three", checked: false },
    ];
    const verifierResults: AcceptanceCriterion[] = [
      { text: "criterion one", checked: true },
      { text: "criterion two", checked: false },
      { text: "criterion three", checked: true },
    ];
    
    const result = decideDone("pass", issueCriteria, verifierResults);
    
    expect(result.status).toBe("needs-human");
    if (result.status === "needs-human") {
      expect(result.reason).toBe("some acceptance criteria are not met");
      expect(result.unmet).toEqual(["criterion two"]);
    }
  });
});
