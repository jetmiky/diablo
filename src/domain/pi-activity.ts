/**
 * parsePiActivity turns ONE line of Pi's `--mode json` JSONL stream into a short
 * human label of what the agent is doing right now — used to fill the heartbeat
 * `activity` field so a long step shows "editing run-step.ts" instead of a bare
 * "working". Only `tool_execution_start` events carry that signal; every other
 * event (and any non-JSON line) yields undefined so the caller keeps the last
 * known activity or shows none.
 *
 * Shapes are taken verbatim from Pi's docs/json.md and its built-in tool
 * definitions (bash/edit/read/write/grep/find/ls), so this is grounded in the
 * real wire format, not a guess. Pure (no I/O) and total (never throws) — a
 * malformed line or missing arg degrades to a barer label.
 */

/** Max label length, so the heartbeat line stays short on a phone. */
const MAX_LABEL = 70;

interface ToolStartEvent {
  type: string;
  toolName?: string;
  args?: unknown;
}

export function parsePiActivity(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  let event: ToolStartEvent;
  try {
    event = JSON.parse(trimmed) as ToolStartEvent;
  } catch {
    return undefined; // streaming noise / partial line
  }

  if (event.type !== "tool_execution_start" || typeof event.toolName !== "string") {
    return undefined;
  }

  const args = (event.args ?? {}) as Record<string, unknown>;
  return labelFor(event.toolName, args);
}

function labelFor(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "bash": {
      const cmd = str(args.command);
      return cmd ? `running ${clipCode(cmd)}` : "running command";
    }
    case "edit":
      return withTarget("editing", base(str(args.path)));
    case "read":
      return withTarget("reading", base(str(args.path)));
    case "write":
      return withTarget("writing", base(str(args.path)));
    case "ls":
      return withTarget("listing", base(str(args.path)));
    case "grep": {
      const p = str(args.pattern);
      return p ? `searching for “${clip(p, 40)}”` : "searching";
    }
    case "find": {
      const p = str(args.pattern);
      return p ? `finding “${clip(p, 40)}”` : "finding";
    }
    default:
      // An unknown/custom tool: the bare verb is still better than "working".
      return `running ${tool}`;
  }
}

/** A verb plus an optional target ("editing run-step.ts" or just "editing"). */
function withTarget(verb: string, target: string | undefined): string {
  return target ? `${verb} ${target}` : verb;
}

/** A path's basename, for compact labels. Undefined when the path is absent. */
function base(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const cleaned = path.replace(/\/+$/, ""); // drop trailing slashes on dirs
  const slash = cleaned.lastIndexOf("/");
  const name = slash >= 0 ? cleaned.slice(slash + 1) : cleaned;
  return name || undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Clip a plain string to a max length with an ellipsis. */
function clip(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Clip a shell command and wrap it in backticks, keeping the whole label short. */
function clipCode(cmd: string): string {
  const budget = MAX_LABEL - "running ".length - 2; // 2 backticks
  const clipped = clip(cmd, budget);
  return `\`${clipped}\``;
}
