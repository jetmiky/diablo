/**
 * Pure CLI argument parser. Turns argv into a discriminated command the
 * composition root can switch on. No I/O here, so it is unit-tested directly;
 * main.ts owns the side effects.
 */

export interface ModelFlagArgs {
  plannerModel?: string;
  workerModel?: string;
  verifierModel?: string;
  /**
   * --plain: force the plainest stdout (no colour, no animation) regardless of
   * TTY. Only present when the flag was passed, mirroring the model-flag
   * convention so a command built without it omits the field entirely.
   */
  plain?: boolean;
}

export type ParsedArgs =
  | ({ command: "run"; issue?: string } & ModelFlagArgs)
  | ({ command: "plan"; issue?: string } & ModelFlagArgs)
  | ({ command: "refactor"; area: string } & ModelFlagArgs)
  | { command: "clean"; issue?: string; force: boolean; keepBranch: boolean }
  | { command: "intake"; feature: string }
  | { command: "telegram"; sub: "setup" }
  | { command: "version" }
  | { command: "help" }
  | { command: "init" }
  | { command: "error"; message: string };

export function parseArgs(argv: string[]): ParsedArgs {
  const [first, ...rest] = argv;

  if (first === undefined || first === "--help" || first === "-h") {
    return { command: "help" };
  }

  if (first === "--version" || first === "-v") {
    return { command: "version" };
  }

  if (first === "init") {
    if (rest.length > 0) {
      return { command: "error", message: "init takes no arguments: diablo init" };
    }
    return { command: "init" };
  }

  if (first === "intake") {
    const feature = rest[0];
    if (feature === undefined) {
      return { command: "error", message: "intake requires a feature slug: diablo intake <feature>" };
    }
    return { command: "intake", feature };
  }

  if (first === "telegram") {
    const sub = rest[0];
    if (sub !== "setup") {
      return { command: "error", message: "telegram requires a subcommand: diablo telegram setup" };
    }
    return { command: "telegram", sub: "setup" };
  }

  if (first === "run" || first === "plan") {
    // For run/plan, the issue is optional. If rest[0] looks like a flag, there's no issue.
    const maybeIssue = rest[0];
    let issue: string | undefined;
    let flagsStart = 0;

    if (maybeIssue === undefined || maybeIssue.startsWith("--")) {
      issue = undefined;
      flagsStart = 0;
    } else {
      issue = maybeIssue;
      flagsStart = 1;
    }

    const flags = parseModelFlags(rest.slice(flagsStart));
    if ("error" in flags) {
      return { command: "error", message: flags.error };
    }

    return first === "run"
      ? { command: "run", issue, ...flags.models }
      : { command: "plan", issue, ...flags.models };
  }

  if (first === "refactor") {
    const target = rest[0];
    if (target === undefined) {
      return { command: "error", message: "refactor requires an area ref: diablo refactor <area>" };
    }

    const flags = parseModelFlags(rest.slice(1));
    if ("error" in flags) {
      return { command: "error", message: flags.error };
    }

    return { command: "refactor", area: target, ...flags.models };
  }

  if (first === "clean") {
    const maybeIssue = rest[0];
    let issue: string | undefined;
    let flagsStart = 0;

    if (maybeIssue === undefined || maybeIssue.startsWith("--")) {
      issue = undefined;
      flagsStart = 0;
    } else {
      issue = maybeIssue;
      flagsStart = 1;
    }

    let force = false;
    let keepBranch = false;
    for (const flag of rest.slice(flagsStart)) {
      if (flag === "--force") force = true;
      else if (flag === "--keep-branch") keepBranch = true;
      else return { command: "error", message: `unknown option: ${flag}` };
    }

    return { command: "clean", issue, force, keepBranch };
  }

  return { command: "error", message: `unknown command: ${first}` };
}

/**
 * Parses the shared --planner-model/--worker-model/--verifier-model flags. Only
 * present flags appear in the result, so a command built from it omits unset
 * override fields (keeping the parsed object minimal and easy to assert on).
 */
function parseModelFlags(
  flags: string[],
): { models: ModelFlagArgs } | { error: string } {
  const models: ModelFlagArgs = {};

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    if (flag === "--plain") {
      models.plain = true;
      continue;
    }
    if (
      flag === "--planner-model" ||
      flag === "--worker-model" ||
      flag === "--verifier-model"
    ) {
      const value = flags[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { error: `${flag} requires a model value` };
      }
      if (flag === "--planner-model") models.plannerModel = value;
      else if (flag === "--worker-model") models.workerModel = value;
      else models.verifierModel = value;
      i++; // consume the value
      continue;
    }
    return { error: `unknown option: ${flag}` };
  }

  return { models };
}
