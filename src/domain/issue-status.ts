/**
 * The diablo run-lifecycle status — a SEPARATE axis from the issue file's
 * human triage `Status:` label. Tracks where an issue sits in the run pipeline:
 *
 *   open         — discovered, not yet planned
 *   planned      — frozen plan exists, ready to run
 *   in-progress  — run is active
 *   needs-human  — blocked on human intervention
 *   done         — run completed successfully
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

export type IssueStatus = "open" | "planned" | "in-progress" | "needs-human" | "done";

export const DEFAULT_STATUS: IssueStatus = "open";

const VALID_STATUSES: readonly IssueStatus[] = [
  "open",
  "planned",
  "in-progress",
  "needs-human",
  "done",
];

export function isIssueStatus(value: unknown): value is IssueStatus {
  return typeof value === "string" && VALID_STATUSES.includes(value as IssueStatus);
}

export function statusBadge(
  status: IssueStatus,
  opts?: { merged?: boolean },
): { symbol: string; label: string } {
  const symbols: Record<IssueStatus, string> = {
    open: "○",
    planned: "●",
    "in-progress": "◐",
    "needs-human": "⚠",
    done: "✓",
  };

  const symbol = symbols[status];
  let label: string = status;

  // Special case: done with merged=false shows "done (unmerged)"
  if (status === "done" && opts?.merged === false) {
    label = "done (unmerged)";
  }

  return { symbol, label };
}
