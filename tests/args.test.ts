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

  test("run without an issue ref is valid and returns undefined issue", () => {
    const parsed = parseArgs(["run"]);
    expect(parsed).toEqual({ command: "run", issue: undefined });
  });

  test("reports an error for an unknown command", () => {
    const parsed = parseArgs(["frobnicate"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/unknown/i);
    }
  });

  test("parses --planner-model and --worker-model overrides on run", () => {
    const parsed = parseArgs([
      "run",
      "billing-02",
      "--planner-model",
      "claude-sonnet-4.5",
      "--worker-model",
      "claude-haiku-4.5",
    ]);
    expect(parsed).toEqual({
      command: "run",
      issue: "billing-02",
      plannerModel: "claude-sonnet-4.5",
      workerModel: "claude-haiku-4.5",
    });
  });

  test("parses --verifier-model override on run", () => {
    const parsed = parseArgs(["run", "billing-02", "--verifier-model", "claude-opus-4.8"]);
    expect(parsed).toEqual({
      command: "run",
      issue: "billing-02",
      verifierModel: "claude-opus-4.8",
    });
  });

  test("parses all three model overrides together", () => {
    const parsed = parseArgs([
      "run",
      "billing-02",
      "--planner-model",
      "p",
      "--worker-model",
      "w",
      "--verifier-model",
      "v",
    ]);
    expect(parsed).toEqual({
      command: "run",
      issue: "billing-02",
      plannerModel: "p",
      workerModel: "w",
      verifierModel: "v",
    });
  });

  test("run without model flags omits the override fields", () => {
    const parsed = parseArgs(["run", "billing-02"]);
    expect(parsed).toEqual({ command: "run", issue: "billing-02" });
  });

  test("reports an error when a model flag is missing its value", () => {
    const parsed = parseArgs(["run", "billing-02", "--worker-model"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/worker-model/i);
    }
  });

  test("run without --plain omits the plain field (matches the model-flag convention)", () => {
    expect(parseArgs(["run", "billing-02"])).toEqual({ command: "run", issue: "billing-02" });
  });

  test("parses --plain on run", () => {
    expect(parseArgs(["run", "billing-02", "--plain"])).toEqual({
      command: "run",
      issue: "billing-02",
      plain: true,
    });
  });

  test("parses --plain alongside model flags", () => {
    expect(parseArgs(["run", "billing-02", "--plain", "--worker-model", "w"])).toEqual({
      command: "run",
      issue: "billing-02",
      plain: true,
      workerModel: "w",
    });
  });

  test("parses --plain on a bare run (no issue)", () => {
    expect(parseArgs(["run", "--plain"])).toEqual({
      command: "run",
      issue: undefined,
      plain: true,
    });
  });

  test("parses --plain on refactor", () => {
    expect(parseArgs(["refactor", "auth-layer", "--plain"])).toEqual({
      command: "refactor",
      area: "auth-layer",
      plain: true,
    });
  });

  test("parses the init command", () => {
    expect(parseArgs(["init"])).toEqual({ command: "init" });
  });

  test("init takes no positional args (extra args are an error)", () => {
    const parsed = parseArgs(["init", "extra"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/init/i);
    }
  });

  test("parses the refactor command with an area ref", () => {
    expect(parseArgs(["refactor", "auth-layer"])).toEqual({
      command: "refactor",
      area: "auth-layer",
    });
  });

  test("refactor requires an area ref", () => {
    const parsed = parseArgs(["refactor"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/area/i);
    }
  });

  test("refactor accepts the same model override flags as run", () => {
    const parsed = parseArgs(["refactor", "auth-layer", "--worker-model", "claude-haiku-4.5"]);
    expect(parsed).toEqual({
      command: "refactor",
      area: "auth-layer",
      workerModel: "claude-haiku-4.5",
    });
  });

  test("parses the intake command with a feature slug", () => {
    expect(parseArgs(["intake", "billing"])).toEqual({ command: "intake", feature: "billing" });
  });

  test("intake requires a feature slug", () => {
    const parsed = parseArgs(["intake"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/feature|intake/i);
    }
  });

  test("parses the plan command with an issue ref", () => {
    expect(parseArgs(["plan", "billing-02"])).toEqual({
      command: "plan",
      issue: "billing-02",
    });
  });

  test("plan without an issue ref is valid and returns undefined issue", () => {
    const parsed = parseArgs(["plan"]);
    expect(parsed).toEqual({ command: "plan", issue: undefined });
  });

  test("plan accepts model override flags", () => {
    const parsed = parseArgs([
      "plan",
      "billing-02",
      "--planner-model",
      "claude-sonnet-4.5",
      "--worker-model",
      "claude-haiku-4.5",
    ]);
    expect(parsed).toEqual({
      command: "plan",
      issue: "billing-02",
      plannerModel: "claude-sonnet-4.5",
      workerModel: "claude-haiku-4.5",
    });
  });

  test("plan with model flag missing value is an error", () => {
    const parsed = parseArgs(["plan", "billing-02", "--worker-model"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/worker-model/i);
    }
  });

  test("bare run with model flags is valid", () => {
    const parsed = parseArgs(["run", "--planner-model", "test"]);
    expect(parsed).toEqual({
      command: "run",
      issue: undefined,
      plannerModel: "test",
    });
  });

  test("parses the 'telegram setup' subcommand", () => {
    expect(parseArgs(["telegram", "setup"])).toEqual({
      command: "telegram",
      sub: "setup",
    });
  });

  test("telegram without a subcommand is an error", () => {
    const parsed = parseArgs(["telegram"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/telegram|setup/i);
    }
  });

  test("telegram with an unknown subcommand is an error", () => {
    const parsed = parseArgs(["telegram", "frobnicate"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/telegram|setup/i);
    }
  });

  test("parses 'clean <issue>' with defaults (no force, delete branch)", () => {
    expect(parseArgs(["clean", "billing-02"])).toEqual({
      command: "clean",
      issue: "billing-02",
      force: false,
      keepBranch: false,
    });
  });

  test("clean without an issue is valid (bare clean → selector)", () => {
    expect(parseArgs(["clean"])).toEqual({
      command: "clean",
      issue: undefined,
      force: false,
      keepBranch: false,
    });
  });

  test("clean parses --force and --keep-branch in any order", () => {
    expect(parseArgs(["clean", "billing-02", "--force", "--keep-branch"])).toEqual({
      command: "clean",
      issue: "billing-02",
      force: true,
      keepBranch: true,
    });
    expect(parseArgs(["clean", "--keep-branch"])).toEqual({
      command: "clean",
      issue: undefined,
      force: false,
      keepBranch: true,
    });
  });

  test("clean with an unknown option is an error", () => {
    const parsed = parseArgs(["clean", "billing-02", "--nope"]);
    expect(parsed.command).toBe("error");
    if (parsed.command === "error") {
      expect(parsed.message).toMatch(/unknown option/i);
    }
  });
});
