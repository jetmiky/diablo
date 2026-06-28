/**
 * Pure CLI argument parser. Turns argv into a discriminated command the
 * composition root can switch on. No I/O here, so it is unit-tested directly;
 * main.ts owns the side effects.
 */

export type ParsedArgs =
  | { command: "run"; issue: string; plannerModel?: string; workerModel?: string }
  | { command: "version" }
  | { command: "help" }
  | { command: "error"; message: string };

export function parseArgs(argv: string[]): ParsedArgs {
  const [first, ...rest] = argv;

  if (first === undefined || first === "--help" || first === "-h") {
    return { command: "help" };
  }

  if (first === "--version" || first === "-v") {
    return { command: "version" };
  }

  if (first === "run") {
    const issue = rest[0];
    if (issue === undefined) {
      return { command: "error", message: "run requires an issue ref: diablo run <issue>" };
    }

    const flags = rest.slice(1);
    let plannerModel: string | undefined;
    let workerModel: string | undefined;

    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i]!;
      if (flag === "--planner-model" || flag === "--worker-model") {
        const value = flags[i + 1];
        if (value === undefined || value.startsWith("--")) {
          return { command: "error", message: `${flag} requires a model value` };
        }
        if (flag === "--planner-model") plannerModel = value;
        else workerModel = value;
        i++; // consume the value
        continue;
      }
      return { command: "error", message: `unknown option: ${flag}` };
    }

    const result: ParsedArgs = { command: "run", issue };
    if (plannerModel !== undefined) result.plannerModel = plannerModel;
    if (workerModel !== undefined) result.workerModel = workerModel;
    return result;
  }

  return { command: "error", message: `unknown command: ${first}` };
}
