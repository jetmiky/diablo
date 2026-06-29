/**
 * Decides whether an issue is done based on the final verification verdict
 * and acceptance criteria checklist comparison.
 *
 * An issue is "done" ONLY if the verdict is PASS AND every acceptance criterion
 * is checked by the verifier. Otherwise it's "needs-human" with the reason and
 * unmet criteria listed.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

import type { Verdict } from "./verdict.ts";
import type { IssueStatus } from "./issue-status.ts";
import type { AcceptanceCriterion } from "./acceptance.ts";

export type DoneDecision =
  | { status: "done" }
  | { status: "needs-human"; unmet: string[]; reason: string };

export function decideDone(
  verdict: Verdict,
  issueCriteria: AcceptanceCriterion[],
  verifierResults: AcceptanceCriterion[],
): DoneDecision {
  // Branch 1: verdict not "pass" → needs-human
  if (verdict !== "pass") {
    return {
      status: "needs-human",
      reason: "final verification did not pass",
      unmet: [],
    };
  }
  
  // Branch 2: verdict "pass" AND issueCriteria empty → done (weak gate)
  if (issueCriteria.length === 0) {
    return { status: "done" };
  }
  
  // Branch 3: verdict "pass" AND count mismatch → needs-human
  if (verifierResults.length !== issueCriteria.length) {
    return {
      status: "needs-human",
      reason: "the verifier did not address every acceptance criterion",
      unmet: issueCriteria.map(c => c.text),
    };
  }
  
  // Branch 4: verdict "pass", counts match: zip by index, check for unmet
  const unmet: string[] = [];
  for (let i = 0; i < issueCriteria.length; i++) {
    if (verifierResults[i]?.checked === false) {
      unmet.push(issueCriteria[i]!.text);
    }
  }
  
  if (unmet.length > 0) {
    return {
      status: "needs-human",
      reason: "some acceptance criteria are not met",
      unmet,
    };
  }
  
  // All criteria met → done
  return { status: "done" };
}
