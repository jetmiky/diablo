import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/args.ts";

describe("parseArgs", () => {
  test("parses the run command with an issue ref", () => {
    expect(parseArgs(["run", "billing-02"])).toEqual({
      command: "run",
      issue: "billing-02",
    });
  });

  test("recognizes --version / -v", () => {
    expect(parseArgs(["--version"])).toEqual({ command: "version" });
    expect(parseArgs(["-v"])).toEqual({ command: "version" });
  });

  test("recognizes --help / -h and bare invocation", () => {
    expect(parseArgs(["--help"])).toEqual({ command: "help" });
    expect(parseArgs(["-h"])).toEqual({ command: "help" });
    expect(parseArgs([])).toEqual({ command: "help" });
  });

  test("reports an error for run without an issue ref", () => {
    const parsed = parseArgs(["run"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/issue/i);
    }
  });

  test("reports an error for an unknown command", () => {
    const parsed = parseArgs(["frobnicate"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/unknown/i);
    }
  });
});
