/**
 * Pure CLI argument parser. Turns argv into a discriminated command the
 * composition root can switch on. No I/O here, so it is unit-tested directly;
 * main.ts owns the side effects.
 */

export interface ModelFlagArgs {
  plannerModel?: string;
  workerModel?: string;
  verifierModel?: string;
}

export type ParsedArgs =
  | ({ command: "run"; issue: string } & ModelFlagArgs)
  | ({ command: "refactor"; area: string } & ModelFlagArgs)
  | { command: "intake"; feature: string }
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

  if (first === "run" || first === "refactor") {
    const target = rest[0];
    if (target === undefined) {
      return first === "run"
        ? { command: "error", message: "run requires an issue ref: diablo run <issue>" }
        : { command: "error", message: "refactor requires an area ref: diablo refactor <area>" };
    }

    const flags = parseModelFlags(rest.slice(1));
    if ("error" in flags) {
      return { command: "error", message: flags.error };
    }

    return first === "run"
      ? { command: "run", issue: target, ...flags.models }
      : { command: "refactor", area: target, ...flags.models };
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
