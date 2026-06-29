/**
 * Given discovered issues with their statuses and a command context, produce
 * the ordered rows a picker displays, with context filtering.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */
import { statusBadge, type IssueStatus } from "./issue-status.ts";

export type SelectorContext = "plan" | "run";

export interface IssueRow {
  issue: string;
  status: IssueStatus;
  merged: boolean;
}

export interface DisplayRow {
  issue: string;
  badge: { symbol: string; label: string };
  hint?: string;
}

export function listFor(context: SelectorContext, rows: IssueRow[]): DisplayRow[] {
  const filtered = rows.filter((row) => shouldShow(context, row));
  const sorted = filtered.sort((a, b) => a.issue.localeCompare(b.issue));
  return sorted.map((row) => toDisplayRow(context, row));
}

function shouldShow(context: SelectorContext, row: IssueRow): boolean {
  // Both contexts exclude done issues
  if (row.status === "done") {
    return false;
  }

  if (context === "run") {
    // Run context shows: open, planned, in-progress, needs-human
    return true;
  }

  if (context === "plan") {
    // Plan context shows everything except done
    return true;
  }

  return false;
}

function toDisplayRow(context: SelectorContext, row: IssueRow): DisplayRow {
  const badge = statusBadge(row.status, { merged: row.merged });
  const hint = getHint(context, row.status);

  return {
    issue: row.issue,
    badge,
    hint,
  };
}

function getHint(context: SelectorContext, status: IssueStatus): string | undefined {
  if (context === "run") {
    if (status === "open") {
      return "no plan → will auto-plan";
    }
    if (status === "planned") {
      return "frozen plan, ready to run";
    }
  }
  return undefined;
}
