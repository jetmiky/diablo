/**
 * The Telegram credential domain: where the push sink's botToken + chatId come
 * from, and the rule that decides whether the sink is enabled at all.
 *
 * Two sources feed the resolver — the process environment and the per-repo
 * credential file (.diablo/telegram.json) — with a strict precedence:
 *
 *   environment  >  .diablo/telegram.json  >  disabled
 *
 * The two sources are MIXABLE per field (e.g. token from env, chatId from
 * file), so CI or a one-off run can override a single value without editing the
 * file. BOTH fields must resolve for the sink to be enabled; a partial config
 * (one present, one missing) leaves Telegram OFF rather than throwing — progress
 * is best-effort and a misconfiguration must never halt a run.
 *
 * Why .diablo/ (and not a separate hand-edited file): the credentials here are
 * MACHINE-written by `diablo telegram setup`, not hand-edited. That makes them
 * machine-managed runtime state, which is exactly what .diablo/ holds — so they
 * belong there, and they inherit the existing `.diablo/` gitignore rule for free
 * (a token can never be committed, with no extra .gitignore entry to forget).
 *
 * All pure (no I/O): the resolver and the file parser are unit-tested directly;
 * the composition root reads the env + file and the setup use-case writes it.
 */

/** The push sink's credentials once fully resolved and confirmed complete. */
export interface TelegramCredentials {
  botToken: string;
  chatId: string;
}

/** A possibly-partial set of credential fields from a single source. */
export interface PartialTelegramCredentials {
  botToken?: string;
  chatId?: string;
}

/**
 * The per-repo credential file path, relative to the repo root. Inside the
 * machine-managed `.diablo/` runtime dir, so it inherits that dir's gitignore
 * rule — the token is never committed without a dedicated .gitignore entry.
 */
export const TELEGRAM_CREDENTIALS_FILENAME = ".diablo/telegram.json";

/**
 * Resolves the effective credentials from the precedence chain (env > file),
 * mixable per field. Returns the complete credentials when BOTH fields resolve,
 * or null when either is missing — a partial config disables the sink rather
 * than erroring. Resolved values are trimmed; blank/whitespace-only values from
 * either source count as absent.
 */
export function resolveTelegramCredentials(
  env: PartialTelegramCredentials,
  file: PartialTelegramCredentials,
): TelegramCredentials | null {
  const botToken = pick(env.botToken, file.botToken);
  const chatId = pick(env.chatId, file.chatId);
  if (botToken === undefined || chatId === undefined) return null;
  return { botToken, chatId };
}

/**
 * Parses the credential file text into whatever fields are present. Tolerant by
 * design: malformed JSON, a non-object root, or a non-string field value all
 * yield no usable credentials (an empty object) rather than throwing — a broken
 * file leaves Telegram disabled, never crashes a run. Pairs with the resolver,
 * which treats a missing field as "disabled".
 */
export function parseTelegramCredentialsFile(text: string): PartialTelegramCredentials {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};

  const obj = raw as Record<string, unknown>;
  const result: PartialTelegramCredentials = {};
  if (typeof obj.botToken === "string") result.botToken = obj.botToken;
  if (typeof obj.chatId === "string") result.chatId = obj.chatId;
  return result;
}

/**
 * Serializes confirmed credentials to the file's on-disk JSON form (pretty,
 * trailing newline), the inverse of parseTelegramCredentialsFile. Used by
 * `diablo telegram setup` to write .diablo/telegram.json.
 */
export function serializeTelegramCredentials(creds: TelegramCredentials): string {
  return JSON.stringify(creds, null, 2) + "\n";
}

/** First non-blank value, trimmed; undefined when neither source has one. */
function pick(envValue: string | undefined, fileValue: string | undefined): string | undefined {
  return nonBlank(envValue) ?? nonBlank(fileValue);
}

function nonBlank(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
