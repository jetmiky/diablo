/**
 * parsePiThought turns ONE line of Pi's `--mode json` JSONL stream into a short
 * label of what the agent is currently *saying or reasoning* — the live "watch
 * Pi think" signal, distinct from `parsePiActivity` (which surfaces TOOL use).
 *
 * Pi streams assistant output as `message_update` events whose
 * `assistantMessageEvent` is a `text_delta` or `thinking_delta` carrying a
 * `delta` string (shape verified against @earendil-works/pi-ai types.d.ts —
 * `AssistantMessageEvent`). Only those two delta kinds yield a label; every
 * other event (tool deltas, starts/ends, non-JSON noise) yields undefined so
 * the caller keeps the last known line or shows none.
 *
 * Pure (no I/O) and total (never throws): a malformed line, missing delta, or
 * empty delta degrades to undefined. The label is whitespace-collapsed and
 * clipped so it never blows up the single live line on a phone or narrow term.
 */

/** Max label length, matching pi-activity so the live line stays short. */
const MAX_LABEL = 70;

interface MessageUpdateEvent {
  type?: string;
  assistantMessageEvent?: {
    type?: string;
    delta?: unknown;
  };
}

export function parsePiThought(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  let event: MessageUpdateEvent;
  try {
    event = JSON.parse(trimmed) as MessageUpdateEvent;
  } catch {
    return undefined; // streaming noise / partial line
  }

  if (event.type !== "message_update") return undefined;

  const inner = event.assistantMessageEvent;
  if (inner?.type !== "text_delta" && inner?.type !== "thinking_delta") return undefined;

  if (typeof inner.delta !== "string") return undefined;
  const collapsed = inner.delta.replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;

  return collapsed.length > MAX_LABEL ? `${collapsed.slice(0, MAX_LABEL - 1)}…` : collapsed;
}
