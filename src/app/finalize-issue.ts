/**
 * Finalizes an issue by checking the done gate and persisting the result.
 *
 * Orchestrates the done-gate decision: parses acceptance criteria from the
 * issue markdown and the verifier's checklist from the verifier text, decides
 * whether the issue is done, flips checkboxes if done, and persists the
 * lifecycle status to state.json.
 */

import type { FsPort } from "../ports/fs.ts";
import type { Verdict } from "../domain/verdict.ts";
import type { DoneDecision } from "../domain/done-gate.ts";
import { parseAcceptanceCriteria, parseCriteriaChecklist, markAllCriteriaChecked } from "../domain/acceptance.ts";
import { decideDone } from "../domain/done-gate.ts";
import { writeStatus } from "./issue-status-store.ts";

export interface FinalizeIssueDeps {
  fs: FsPort;
}

export interface FinalizeIssueOpts {
  issuePath: string;
  diabloDir: string;
  issue: string;
  verdict: Verdict;
  verifierText: string;
}

export async function finalizeIssue(
  deps: FinalizeIssueDeps,
  opts: FinalizeIssueOpts,
): Promise<DoneDecision> {
  // 1. Read issue markdown (treat missing file as empty)
  let markdown = "";
  try {
    markdown = await deps.fs.read(opts.issuePath);
  } catch {
    // File doesn't exist, treat criteria as empty
  }
  
  // 2. Parse acceptance criteria and verifier results
  const issueCriteria = parseAcceptanceCriteria(markdown);
  const verifierResults = parseCriteriaChecklist(opts.verifierText);
  
  // 3. Make the done decision
  const decision = decideDone(opts.verdict, issueCriteria, verifierResults);
  
  // 4. Handle done case
  if (decision.status === "done") {
    // Flip checkboxes if there were criteria
    if (issueCriteria.length > 0) {
      const updated = markAllCriteriaChecked(markdown);
      await deps.fs.write(opts.issuePath, updated);
    }
    // Persist status
    await writeStatus(deps, { 
      diabloDir: opts.diabloDir, 
      issue: opts.issue, 
      status: "done" 
    });
  } else {
    // 5. Handle needs-human case - only persist status, don't flip checkboxes
    await writeStatus(deps, { 
      diabloDir: opts.diabloDir, 
      issue: opts.issue, 
      status: "needs-human" 
    });
  }
  
  // 6. Return the decision
  return decision;
}
