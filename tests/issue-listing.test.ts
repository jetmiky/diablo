import { describe, expect, test } from "bun:test";
import {
  listFor,
  type SelectorContext,
  type IssueRow,
  type DisplayRow,
} from "../src/domain/issue-listing.ts";

describe("listFor", () => {
  describe("run context", () => {
    test("shows open issues with 'no plan → will auto-plan' hint", () => {
      const rows: IssueRow[] = [
        { issue: "auth-01", status: "open", merged: false },
      ];
      const result = listFor("run", rows);

      expect(result).toHaveLength(1);
      expect(result[0]!.issue).toBe("auth-01");
      expect(result[0]!.badge).toEqual({ symbol: "○", label: "open" });
      expect(result[0]!.hint).toBe("no plan → will auto-plan");
    });

    test("shows planned issues with 'frozen plan, ready to run' hint", () => {
      const rows: IssueRow[] = [
        { issue: "auth-02", status: "planned", merged: false },
      ];
      const result = listFor("run", rows);

      expect(result).toHaveLength(1);
      expect(result[0]!.issue).toBe("auth-02");
      expect(result[0]!.badge).toEqual({ symbol: "●", label: "planned" });
      expect(result[0]!.hint).toBe("frozen plan, ready to run");
    });

    test("shows in-progress issues without a hint", () => {
      const rows: IssueRow[] = [
        { issue: "auth-03", status: "in-progress", merged: false },
      ];
      const result = listFor("run", rows);

      expect(result).toHaveLength(1);
      expect(result[0]!.issue).toBe("auth-03");
      expect(result[0]!.badge).toEqual({ symbol: "◐", label: "in-progress" });
      expect(result[0]!.hint).toBeUndefined();
    });

    test("shows needs-human issues without a hint", () => {
      const rows: IssueRow[] = [
        { issue: "auth-04", status: "needs-human", merged: false },
      ];
      const result = listFor("run", rows);

      expect(result).toHaveLength(1);
      expect(result[0]!.issue).toBe("auth-04");
      expect(result[0]!.badge).toEqual({ symbol: "⚠", label: "needs-human" });
      expect(result[0]!.hint).toBeUndefined();
    });

    test("excludes done issues (merged and unmerged)", () => {
      const rows: IssueRow[] = [
        { issue: "auth-05", status: "done", merged: true },
        { issue: "auth-06", status: "done", merged: false },
        { issue: "auth-07", status: "open", merged: false },
      ];
      const result = listFor("run", rows);

      expect(result).toHaveLength(1);
      expect(result[0]!.issue).toBe("auth-07");
    });
  });

  describe("plan context", () => {
    test("shows open issues as plannable", () => {
      const rows: IssueRow[] = [
        { issue: "billing-01", status: "open", merged: false },
      ];
      const result = listFor("plan", rows);

      expect(result).toHaveLength(1);
      expect(result[0]!.issue).toBe("billing-01");
      expect(result[0]!.badge).toEqual({ symbol: "○", label: "open" });
      expect(result[0]!.hint).toBeUndefined();
    });

    test("shows in-progress and needs-human as plannable", () => {
      const rows: IssueRow[] = [
        { issue: "billing-02", status: "in-progress", merged: false },
        { issue: "billing-03", status: "needs-human", merged: false },
      ];
      const result = listFor("plan", rows);

      expect(result).toHaveLength(2);
      expect(result[0]!.issue).toBe("billing-02");
      expect(result[1]!.issue).toBe("billing-03");
    });

    test("excludes done issues", () => {
      const rows: IssueRow[] = [
        { issue: "billing-04", status: "done", merged: true },
        { issue: "billing-05", status: "done", merged: false },
        { issue: "billing-06", status: "open", merged: false },
      ];
      const result = listFor("plan", rows);

      expect(result).toHaveLength(1);
      expect(result[0]!.issue).toBe("billing-06");
    });

    test("shows planned issues (can be re-planned)", () => {
      const rows: IssueRow[] = [
        { issue: "billing-07", status: "planned", merged: false },
      ];
      const result = listFor("plan", rows);

      expect(result).toHaveLength(1);
      expect(result[0]!.issue).toBe("billing-07");
    });
  });

  describe("ordering", () => {
    test("sorts by issue name ascending", () => {
      const rows: IssueRow[] = [
        { issue: "zebra-03", status: "open", merged: false },
        { issue: "alpha-01", status: "planned", merged: false },
        { issue: "beta-02", status: "in-progress", merged: false },
      ];
      const result = listFor("run", rows);

      expect(result.map((r) => r.issue)).toEqual([
        "alpha-01",
        "beta-02",
        "zebra-03",
      ]);
    });
  });

  describe("badge wiring", () => {
    test("passes merged flag to statusBadge for done (unmerged)", () => {
      const rows: IssueRow[] = [
        { issue: "auth-08", status: "in-progress", merged: false },
      ];
      const result = listFor("plan", rows);

      expect(result[0]!.badge).toEqual({ symbol: "◐", label: "in-progress" });
    });

    test("builds badge via statusBadge with merged flag", () => {
      const rows: IssueRow[] = [
        { issue: "auth-09", status: "open", merged: true },
        { issue: "auth-10", status: "planned", merged: false },
      ];
      const result = listFor("run", rows);

      expect(result[0]!.badge).toEqual({ symbol: "○", label: "open" });
      expect(result[1]!.badge).toEqual({ symbol: "●", label: "planned" });
    });
  });

  describe("comprehensive filtering", () => {
    test("run context filters and orders correctly", () => {
      const rows: IssueRow[] = [
        { issue: "done-merged", status: "done", merged: true },
        { issue: "done-unmerged", status: "done", merged: false },
        { issue: "needs-human", status: "needs-human", merged: false },
        { issue: "in-progress", status: "in-progress", merged: false },
        { issue: "planned", status: "planned", merged: false },
        { issue: "open", status: "open", merged: false },
      ];
      const result = listFor("run", rows);

      expect(result.map((r) => r.issue)).toEqual([
        "in-progress",
        "needs-human",
        "open",
        "planned",
      ]);
      // Verify hints
      expect(result.find((r) => r.issue === "open")?.hint).toBe("no plan → will auto-plan");
      expect(result.find((r) => r.issue === "planned")?.hint).toBe("frozen plan, ready to run");
      expect(result.find((r) => r.issue === "in-progress")?.hint).toBeUndefined();
      expect(result.find((r) => r.issue === "needs-human")?.hint).toBeUndefined();
    });

    test("plan context filters and orders correctly", () => {
      const rows: IssueRow[] = [
        { issue: "done-merged", status: "done", merged: true },
        { issue: "done-unmerged", status: "done", merged: false },
        { issue: "needs-human", status: "needs-human", merged: false },
        { issue: "in-progress", status: "in-progress", merged: false },
        { issue: "planned", status: "planned", merged: false },
        { issue: "open", status: "open", merged: false },
      ];
      const result = listFor("plan", rows);

      expect(result.map((r) => r.issue)).toEqual([
        "in-progress",
        "needs-human",
        "open",
        "planned",
      ]);
      // No hints in plan context
      expect(result.every((r) => r.hint === undefined)).toBe(true);
    });
  });
});
