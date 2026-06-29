import { describe, expect, test } from "bun:test";
import { classifyTurn } from "../src/domain/approval.ts";

describe("classifyTurn", () => {
  // Approve detection - must be exact token
  test("exact 'approve' → approve", () => {
    expect(classifyTurn("approve")).toBe("approve");
  });

  test("exact 'APPROVE' (uppercase) → approve", () => {
    expect(classifyTurn("APPROVE")).toBe("approve");
  });

  test("exact 'Approve' (mixed case) → approve", () => {
    expect(classifyTurn("Approve")).toBe("approve");
  });

  test("exact '/approve' → approve", () => {
    expect(classifyTurn("/approve")).toBe("approve");
  });

  test("exact '/APPROVE' → approve", () => {
    expect(classifyTurn("/APPROVE")).toBe("approve");
  });

  test("'approve' with surrounding whitespace → approve", () => {
    expect(classifyTurn("  approve  ")).toBe("approve");
    expect(classifyTurn("\napprove\n")).toBe("approve");
  });

  // Reopen detection - must be exact token
  test("exact 'reopen' → reopen", () => {
    expect(classifyTurn("reopen")).toBe("reopen");
  });

  test("exact 'REOPEN' (uppercase) → reopen", () => {
    expect(classifyTurn("REOPEN")).toBe("reopen");
  });

  test("exact '/reopen' → reopen", () => {
    expect(classifyTurn("/reopen")).toBe("reopen");
  });

  test("'reopen' with surrounding whitespace → reopen", () => {
    expect(classifyTurn("  reopen  ")).toBe("reopen");
  });

  // Challenge (everything else, including phrases containing approve/reopen)
  test("'looks good, approve it' → challenge (NOT approve)", () => {
    expect(classifyTurn("looks good, approve it")).toBe("challenge");
  });

  test("'please approve this' → challenge", () => {
    expect(classifyTurn("please approve this")).toBe("challenge");
  });

  test("'I approve of this approach' → challenge", () => {
    expect(classifyTurn("I approve of this approach")).toBe("challenge");
  });

  test("'approved' (past tense) → challenge", () => {
    expect(classifyTurn("approved")).toBe("challenge");
  });

  test("'we should reopen this discussion' → challenge", () => {
    expect(classifyTurn("we should reopen this discussion")).toBe("challenge");
  });

  test("empty string → challenge", () => {
    expect(classifyTurn("")).toBe("challenge");
  });

  test("only whitespace → challenge", () => {
    expect(classifyTurn("   ")).toBe("challenge");
  });

  test("random text → challenge", () => {
    expect(classifyTurn("What about edge case X?")).toBe("challenge");
  });

  test("'no' → challenge", () => {
    expect(classifyTurn("no")).toBe("challenge");
  });
});
