/**
 * Enrich-issues use-case: given a list of issue names, look up each one's
 * status and merged-state to build IssueRow[] for the selector. Merged-state
 * is only relevant for done issues (and only computed for them, to avoid
 * unnecessary git calls).
 */
import type { FsPort } from "../ports/fs.ts";
import type { GitMergePort } from "../ports/git-merge.ts";
import type { IssueRow } from "../domain/issue-listing.ts";
import { readStatus } from "./issue-status-store.ts";

export interface EnrichIssuesDeps {
  fs: FsPort;
  git: GitMergePort;
}

export interface EnrichIssuesOpts {
  issues: string[];
  diabloDir: string;
  targetBranch: string;
  branchPrefix: string;
}

/**
 * Enriches a list of issue names with their statuses and merged-states,
 * returning IssueRow[] suitable for the issue selector. Preserves input order.
 * For done issues, attempts to determine merged-state via git; for non-done
 * issues, merged is always false (irrelevant for non-done badges).
 */
export async function enrichIssues(
  deps: EnrichIssuesDeps,
  opts: EnrichIssuesOpts,
): Promise<IssueRow[]> {
  const rows: IssueRow[] = [];

  for (const issue of opts.issues) {
    const status = await readStatus({ fs: deps.fs }, { diabloDir: opts.diabloDir, issue });

    let merged = false;
    if (status === "done") {
      // Only check merged-state for done issues
      const branch = `${opts.branchPrefix}${issue}`;
      try {
        merged = await deps.git.isMerged(branch, opts.targetBranch);
      } catch {
        // Branch doesn't exist or other git error → treat as not merged
        merged = false;
      }
    }

    rows.push({ issue, status, merged });
  }

  return rows;
}
