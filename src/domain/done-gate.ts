/**
 * Decides whether an issue is "done" based on the final verification verdict and
 * an acceptance-criteria comparison.
 *
 * An issue is "done" ONLY if the verdict is PASS AND every acceptance criterion
 * is matched-and-checked by the verifier. Otherwise it is "needs-human" with the
 * reason and the unmet/unmatched criteria listed.
 *
 * Two robustness properties (issue 06):
 *
 *  1. Matching is by NORMALIZED TEXT, not list position. The verifier's
 *     `CRITERIA:` checklist is free-form LLM output; it may reorder, reword
 *     slightly, or add extra lines. Each issue criterion is matched to a verifier
 *     entry by a normalized key (lowercased, collapsed whitespace, stripped
 *     trailing punctuation), so a reorder or cosmetic difference does not produce
 *     a false "needs-human". An issue criterion with no matching checked verifier
 *     entry is unmet.
 *
 *  2. "No criteria" is distinguished from "criteria failed to parse". A trivial
 *     ticket with NO acceptance-criteria section is a deliberate weak gate
 *     (warn-and-proceed → done on PASS). But a criteria SECTION that was present
 *     yet parsed to zero items is a malformed spec — you cannot verify what did
 *     not parse — so it is needs-human, never a silent done. The caller passes
 *     `sectionPresent` to make that distinction; omitted, it defaults to the
 *     trivial-ticket reading for back-compat.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

import type { Verdict } from "./verdict.ts";
import type { IssueStatus } from "./issue-status.ts";
import type { AcceptanceCriterion } from "./acceptance.ts";

export type DoneDecision =
  | { status: "done" }
  | { status: "needs-human"; unmet: string[]; reason: string };

export interface DecideDoneOpts {
  /**
   * Whether the issue markdown actually had an "## Acceptance criteria" section.
   * true + zero parsed criteria = a malformed/unparseable spec (needs-human);
   * false = a trivial ticket with no criteria (weak gate → done on pass).
   * Defaults to false (trivial-ticket reading) for back-compat.
   */
  sectionPresent?: boolean;
}

/**
 * Normalizes a criterion to a match key: strips any trailing ` — rationale`
 * the verifier appends (em-dash, en-dash, or `--`), lowercases, collapses
 * whitespace, and drops trailing punctuation. The verifier writes entries like
 * `bug is fixed — test_billing.test.ts passes`; the issue carries the bare
 * `bug is fixed`. Stripping the rationale on both sides lets them match by the
 * criterion text alone instead of by list position.
 */
function key(text: string): string {
  return text
    .split(/\s+(?:—|–|--)\s+/)[0]!
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!,;:]+$/, "");
}

export function decideDone(
  verdict: Verdict,
  issueCriteria: AcceptanceCriterion[],
  verifierResults: AcceptanceCriterion[],
  opts: DecideDoneOpts = {},
): DoneDecision {
  // The final verification must have passed at all.
  if (verdict !== "pass") {
    return { status: "needs-human", reason: "final verification did not pass", unmet: [] };
  }

  // No criteria parsed: distinguish a trivial ticket from a malformed spec.
  if (issueCriteria.length === 0) {
    if (opts.sectionPresent) {
      return {
        status: "needs-human",
        reason: "the acceptance-criteria section is present but could not be parsed",
        unmet: [],
      };
    }
    return { status: "done" }; // trivial ticket, weak gate
  }

  // Build a key → checked map from the verifier's checklist. A criterion is
  // satisfied iff a verifier entry with the same normalized key is checked. Last
  // write wins on duplicate keys; an OR would let a stray unchecked dupe mask a
  // checked one, but a checked dupe should not be masked either — so prefer any
  // checked entry for a key.
  const verifierChecked = new Map<string, boolean>();
  for (const r of verifierResults) {
    const k = key(r.text);
    verifierChecked.set(k, (verifierChecked.get(k) ?? false) || r.checked);
  }

  const unmet: string[] = [];
  for (const c of issueCriteria) {
    if (verifierChecked.get(key(c.text)) !== true) unmet.push(c.text);
  }

  if (unmet.length > 0) {
    return {
      status: "needs-human",
      reason: "some acceptance criteria are not met or were not addressed by the verifier",
      unmet,
    };
  }

  return { status: "done" };
}
