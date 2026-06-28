/**
 * Pure CLI argument parser. Turns argv into a discriminated command the
 * composition root can switch on. No I/O here, so it is unit-tested directly;
 * main.ts owns the side effects.
 */

export type ParsedArgs =
  | { command: "run"; issue: string }
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
    return { command: "run", issue };
  }

  return { command: "error", message: `unknown command: ${first}` };
}
