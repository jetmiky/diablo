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

/** Flags accepted by `diablo init`. */
export interface InitFlags {
  /** --interactive / -i: run the full interactive flow (Pi session + prompts). */
  interactive: boolean;
  /** --agents (default) or --claude: which agent guidance doc to scaffold. */
  agentDoc: "agents" | "claude";
  /** --context single|multiple: context layout mode. */
  context: "single" | "multiple";
  /** --markdown: issue tracker type (future-proofing for other trackers). */
  tracker: "markdown";
  /**
   * Triage label scaffold policy.
   * - `[]` (empty) → scaffold with the default 5-label vocabulary
   * - `["a","b"]` → scaffold with these custom labels
   * - `null` → skip triage scaffold entirely (--no-triage-labels)
   */
  triageLabels: string[] | null;
  /** --bootstrap: run git init + husky/commitlint. */
  bootstrap: boolean;
  /** --package-manager bun|npm|pnpm|skip: non-interactive PM choice. */
  packageManager?: string;
  /** --setup-skills: run the interactive Pi skill-setup session. */
  setupSkills: boolean;
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
  | ({ command: "init" } & InitFlags)
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
    const parsed = parseInitFlags(rest);
    if ("error" in parsed) {
      return { command: "error", message: parsed.error };
    }
    return { command: "init", ...parsed.flags };
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

/** The default init flags — zero-argument `diablo init` uses these. */
export const INIT_DEFAULTS: InitFlags = {
  interactive: false,
  agentDoc: "agents",
  context: "single",
  tracker: "markdown",
  triageLabels: [],
  bootstrap: false,
  setupSkills: false,
};

/**
 * Parses `diablo init` flags. Returns the resolved InitFlags on success, or a
 * human-readable error on conflict / missing value / unknown flag.
 *
 * Mutual exclusions enforced:
 * - `--agents` + `--claude` → error
 * - `--bootstrap` + `--package-manager` → error (PM implies bootstrap)
 * - `--triage-labels` + `--no-triage-labels` → error
 */
function parseInitFlags(flags: string[]): { flags: InitFlags } | { error: string } {
  const result: InitFlags = { ...INIT_DEFAULTS };
  const seen = new Set<string>();

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;

    if (flag === "--interactive" || flag === "-i") {
      result.interactive = true;
      continue;
    }

    if (flag === "--agents") {
      if (seen.has("--claude")) return { error: "cannot combine --agents and --claude" };
      seen.add("--agents");
      result.agentDoc = "agents";
      continue;
    }

    if (flag === "--claude") {
      if (seen.has("--agents")) return { error: "cannot combine --agents and --claude" };
      seen.add("--claude");
      result.agentDoc = "claude";
      continue;
    }

    if (flag === "--context") {
      const value = flags[i + 1];
      if (value === undefined || value.startsWith("-")) {
        return { error: "--context requires a value (single or multiple)" };
      }
      if (value !== "single" && value !== "multiple") {
        return { error: `invalid --context value: ${value} (expected single or multiple)` };
      }
      result.context = value;
      i++; // consume the value
      continue;
    }

    if (flag === "--markdown") {
      result.tracker = "markdown";
      continue;
    }

    if (flag === "--triage-labels") {
      if (seen.has("--no-triage-labels"))
        return { error: "cannot combine --triage-labels and --no-triage-labels" };
      seen.add("--triage-labels");
      const value = flags[i + 1];
      if (value !== undefined && !value.startsWith("-")) {
        result.triageLabels = value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        i++; // consume the value
      } else {
        result.triageLabels = []; // default labels
      }
      continue;
    }

    if (flag === "--no-triage-labels") {
      if (seen.has("--triage-labels"))
        return { error: "cannot combine --triage-labels and --no-triage-labels" };
      seen.add("--no-triage-labels");
      result.triageLabels = null;
      continue;
    }

    if (flag === "--bootstrap") {
      if (seen.has("--package-manager"))
        return { error: "--package-manager already implies --bootstrap" };
      seen.add("--bootstrap");
      result.bootstrap = true;
      continue;
    }

    if (flag === "--package-manager") {
      if (seen.has("--bootstrap"))
        return { error: "--package-manager already implies --bootstrap" };
      seen.add("--package-manager");
      const value = flags[i + 1];
      if (value === undefined || value.startsWith("-")) {
        return { error: "--package-manager requires a value (bun, npm, pnpm, or skip)" };
      }
      result.packageManager = value;
      result.bootstrap = true; // implies bootstrap
      i++; // consume the value
      continue;
    }

    if (flag === "--setup-skills") {
      result.setupSkills = true;
      continue;
    }

    // Unknown flag or positional arg
    if (flag.startsWith("-")) {
      return { error: `unknown init option: ${flag}` };
    }
    return { error: `init does not accept positional arguments: ${flag}` };
  }

  return { flags: result };
}
