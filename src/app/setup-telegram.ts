/**
 * setupTelegram is the `diablo telegram setup` use-case: it interactively
 * collects the bot token and chat id, then writes them to the per-repo
 * credential file (.diablo/telegram.json). This is the command that makes the
 * credentials MACHINE-written rather than hand-edited — which is exactly why
 * they belong in the machine-managed `.diablo/` runtime dir.
 *
 * Both fields are required: a blank answer to either prompt ABORTS without
 * writing (and explains which field was missing), so the command never leaves a
 * partial file behind that the resolver would silently treat as "disabled".
 *
 * The interactive prompt and the filesystem are injected, so the collect →
 * validate → write policy is unit-tested against fakes; main.ts wires the real
 * StdinPrompt + NodeFs.
 */
import type { FsPort } from "../ports/fs.ts";
import type { PromptPort } from "../ports/prompt.ts";
import { serializeTelegramCredentials } from "../domain/telegram-credentials.ts";

export interface SetupTelegramDeps {
  fs: FsPort;
  prompt: PromptPort;
  /** Prints a user-facing line (real: process.stdout). */
  print: (line: string) => void;
}

export interface SetupTelegramConfig {
  /** Absolute path where the credential file should be written. */
  credentialsPath: string;
}

/** Whether the credential file was written, or the command aborted (blank input). */
export type SetupTelegramOutcome = "written" | "aborted";

const TOKEN_QUESTION =
  "Telegram bot token (from @BotFather):";
const CHAT_ID_QUESTION =
  "Telegram chat id (the chat to push progress to):";

export async function setupTelegram(
  deps: SetupTelegramDeps,
  config: SetupTelegramConfig,
): Promise<SetupTelegramOutcome> {
  const botToken = (await deps.prompt.ask(TOKEN_QUESTION)).trim();
  if (botToken === "") {
    deps.print("No bot token entered — aborted. Nothing was written.");
    return "aborted";
  }

  const chatId = (await deps.prompt.ask(CHAT_ID_QUESTION)).trim();
  if (chatId === "") {
    deps.print("No chat id entered — aborted. Nothing was written.");
    return "aborted";
  }

  await deps.fs.write(config.credentialsPath, serializeTelegramCredentials({ botToken, chatId }));
  return "written";
}
