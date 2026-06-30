import { describe, expect, test } from "bun:test";
import { progressBar } from "../src/domain/progress-bar.ts";

describe("progressBar", () => {
  test("renders a fixed-width bar with filled and empty cells", () => {
    // 1 of 4 → 25% of 8 cells = 2 filled, 6 empty.
    expect(progressBar(1, 4, 8)).toBe("██░░░░░░");
  });

  test("the last stage fills the whole bar", () => {
    expect(progressBar(4, 4, 8)).toBe("████████");
  });

  test("rounds to the nearest cell", () => {
    // 2 of 3 → 66.7% of 6 cells = 4 filled (4.0), 2 empty.
    expect(progressBar(2, 3, 6)).toBe("████░░");
  });

  test("a single completed stage out of many shows at least the rounded fill", () => {
    // 1 of 10 → 10% of 10 cells = 1 filled, 9 empty.
    expect(progressBar(1, 10, 10)).toBe("█░░░░░░░░░");
  });

  test("clamps a degenerate total (0) to an empty bar rather than dividing by zero", () => {
    expect(progressBar(1, 0, 6)).toBe("░░░░░░");
  });

  test("clamps an index past the total to a full bar", () => {
    expect(progressBar(5, 4, 4)).toBe("████");
  });
});
