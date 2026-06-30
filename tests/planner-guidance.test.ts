import { describe, expect, test } from "bun:test";
import { PLANNER_GUIDANCE } from "../src/app/planner-guidance.ts";

describe("PLANNER_GUIDANCE", () => {
  // Issue #1 option C: a stage that produces zero compilable files leaves the
  // gate with nothing to typecheck; fold scaffolding into the first stage that
  // also writes a source file so the empty-tree state never arises.
  test("tells the planner not to emit a stage with no compilable source file", () => {
    const lower = PLANNER_GUIDANCE.toLowerCase();
    expect(lower).toMatch(/scaffold|compilable|source file|empty/);
    expect(lower).toMatch(/stage/);
  });

  // Issue #2 option C: the planner must not invent acceptance criteria that are
  // absent from the ticket (e.g. "no type assertions"), since the final
  // holistic verifier enforces every criterion strictly.
  test("tells the planner that task acceptance criteria must trace to the ticket", () => {
    const lower = PLANNER_GUIDANCE.toLowerCase();
    expect(lower).toMatch(/acceptance criteri/);
    expect(lower).toMatch(/ticket|do not invent|not invent|trace/);
  });
});
