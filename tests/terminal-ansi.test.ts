import { describe, expect, test } from "bun:test";
import { renderAnsi } from "../src/domain/terminal-ansi.ts";

// ANSI SGR constants, mirrored here so the test asserts on the real wire bytes
// rather than re-deriving them from the implementation.
const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

describe("renderAnsi", () => {
  test("bold markdown → ANSI bold when colour is enabled", () => {
    expect(renderAnsi("stage **Wire the parser** started", true)).toBe(
      `stage ${BOLD}Wire the parser${RESET} started`,
    );
  });

  test("colour off → markup STRIPPED to plain text (no leaked ** asterisks)", () => {
    expect(renderAnsi("stage **Wire the parser** started", false)).toBe(
      "stage Wire the parser started",
    );
  });

  test("inline `code` → cyan when colour is on", () => {
    expect(renderAnsi("committed `a1b2c3d`", true)).toBe(`committed ${CYAN}a1b2c3d${RESET}`);
  });

  test("inline `code` → backticks stripped to plain when colour is off", () => {
    expect(renderAnsi("committed `a1b2c3d`", false)).toBe("committed a1b2c3d");
  });

  test("plain text with no markup is returned unchanged in both modes", () => {
    expect(renderAnsi("worker: implementing", true)).toBe("worker: implementing");
    expect(renderAnsi("worker: implementing", false)).toBe("worker: implementing");
  });
});
