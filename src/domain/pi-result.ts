/**
 * Parses the result of a Pi `--mode json` run.
 *
 * Pi emits a JSONL event stream (one JSON object per line): `session`,
 * `agent_start`, `message_start`, `message_update`, `message_end`, `turn_*`,
 * and finally `agent_end`. The `agent_end` event carries the full `messages`
 * array. We read the result from there — the last assistant message — and
 * ignore the streaming noise.
 *
 * This module is pure (no I/O) so it is unit-tested directly.
 */

export interface PiUsage {
  totalTokens: number;
  cost: number;
}

export interface PiResult {
  text: string;
  stopReason: string | undefined;
  usage: PiUsage;
}

interface ContentBlock {
  type?: string;
  text?: string;
}

interface Message {
  role?: string;
  content?: ContentBlock[];
  stopReason?: string;
  usage?: {
    totalTokens?: number;
    cost?: { total?: number };
  };
}

interface AgentEndEvent {
  type?: string;
  messages?: Message[];
}

/**
 * Strips leaked `<thinking>`/`<think>` reasoning that some providers/proxies
 * (e.g. 9router) inline as a literal string inside a text block.
 */
function stripReasoningTags(text: string): string {
  let out = text.replace(/<(thinking|think)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  out = out.replace(/<(thinking|think)\b[^>]*>[\s\S]*$/gi, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function messageText(message: Message): string {
  const blocks = Array.isArray(message.content) ? message.content : [];
  return blocks
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

/**
 * Parses a Pi JSONL event stream into a structured result.
 *
 * @throws if the stream contains no `agent_end` event (the run did not
 *   complete — a stuck or killed worker).
 */
export function parsePiResult(jsonl: string): PiResult {
  const agentEnd = findAgentEnd(jsonl);
  if (!agentEnd) {
    throw new Error("Pi run produced no agent_end event (run did not complete)");
  }

  const messages = Array.isArray(agentEnd.messages) ? agentEnd.messages : [];
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  const text = lastAssistant ? stripReasoningTags(messageText(lastAssistant)) : "";
  const usage = lastAssistant?.usage;

  return {
    text,
    stopReason: lastAssistant?.stopReason,
    usage: {
      totalTokens: usage?.totalTokens ?? 0,
      cost: usage?.cost?.total ?? 0,
    },
  };
}

function findAgentEnd(jsonl: string): AgentEndEvent | undefined {
  const lines = jsonl.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    let event: AgentEndEvent;
    try {
      event = JSON.parse(line) as AgentEndEvent;
    } catch {
      continue;
    }
    if (event.type === "agent_end") return event;
  }
  return undefined;
}
