import { describe, expect, test } from "bun:test";
import {
  isIssueStatus,
  statusBadge,
  DEFAULT_STATUS,
  type IssueStatus,
} from "../src/domain/issue-status.ts";

describe("isIssueStatus", () => {
  test("returns true for valid status strings", () => {
    expect(isIssueStatus("open")).toBe(true);
    expect(isIssueStatus("planned")).toBe(true);
    expect(isIssueStatus("in-progress")).toBe(true);
    expect(isIssueStatus("needs-human")).toBe(true);
    expect(isIssueStatus("done")).toBe(true);
  });

  test("returns false for invalid values", () => {
    expect(isIssueStatus("bogus")).toBe(false);
    expect(isIssueStatus("")).toBe(false);
    expect(isIssueStatus(null)).toBe(false);
    expect(isIssueStatus(undefined)).toBe(false);
    expect(isIssueStatus(42)).toBe(false);
    expect(isIssueStatus({})).toBe(false);
  });
});

describe("DEFAULT_STATUS", () => {
  test("is 'open'", () => {
    expect(DEFAULT_STATUS).toBe("open");
  });
});

describe("statusBadge", () => {
  test("maps each status to a symbol and label", () => {
    expect(statusBadge("open")).toEqual({ symbol: "○", label: "open" });
    expect(statusBadge("planned")).toEqual({ symbol: "●", label: "planned" });
    expect(statusBadge("in-progress")).toEqual({ symbol: "◐", label: "in-progress" });
    expect(statusBadge("needs-human")).toEqual({ symbol: "⚠", label: "needs-human" });
    expect(statusBadge("done")).toEqual({ symbol: "✓", label: "done" });
  });

  test("for done with merged=false, label is 'done (unmerged)'", () => {
    expect(statusBadge("done", { merged: false })).toEqual({
      symbol: "✓",
      label: "done (unmerged)",
    });
  });

  test("for done with merged=true or undefined, label is 'done'", () => {
    expect(statusBadge("done", { merged: true })).toEqual({
      symbol: "✓",
      label: "done",
    });
    expect(statusBadge("done")).toEqual({
      symbol: "✓",
      label: "done",
    });
  });

  test("merged option does not affect non-done statuses", () => {
    expect(statusBadge("open", { merged: false })).toEqual({ symbol: "○", label: "open" });
    expect(statusBadge("planned", { merged: true })).toEqual({ symbol: "●", label: "planned" });
  });
});
