import { describe, expect, test } from "bun:test";
import {
  parseTelegramCredentialsFile,
  resolveTelegramCredentials,
  serializeTelegramCredentials,
  TELEGRAM_CREDENTIALS_FILENAME,
} from "../src/domain/telegram-credentials.ts";

describe("resolveTelegramCredentials", () => {
  test("enables when both fields come from the file", () => {
    expect(
      resolveTelegramCredentials({}, { botToken: "file-tok", chatId: "file-chat" }),
    ).toEqual({ botToken: "file-tok", chatId: "file-chat" });
  });

  test("enables when both fields come from the env", () => {
    expect(
      resolveTelegramCredentials({ botToken: "env-tok", chatId: "env-chat" }, {}),
    ).toEqual({ botToken: "env-tok", chatId: "env-chat" });
  });

  test("env wins over the file, per field", () => {
    expect(
      resolveTelegramCredentials(
        { botToken: "env-tok", chatId: "env-chat" },
        { botToken: "file-tok", chatId: "file-chat" },
      ),
    ).toEqual({ botToken: "env-tok", chatId: "env-chat" });
  });

  test("mixes sources: token from env, chatId from file", () => {
    expect(
      resolveTelegramCredentials({ botToken: "env-tok" }, { chatId: "file-chat" }),
    ).toEqual({ botToken: "env-tok", chatId: "file-chat" });
  });

  test("mixes sources: token from file, chatId from env", () => {
    expect(
      resolveTelegramCredentials({ chatId: "env-chat" }, { botToken: "file-tok" }),
    ).toEqual({ botToken: "file-tok", chatId: "env-chat" });
  });

  test("disabled (null) when neither source has anything", () => {
    expect(resolveTelegramCredentials({}, {})).toBeNull();
  });

  test("disabled when only the token resolves (partial → off, never throws)", () => {
    expect(resolveTelegramCredentials({ botToken: "tok" }, {})).toBeNull();
  });

  test("disabled when only the chatId resolves (partial → off, never throws)", () => {
    expect(resolveTelegramCredentials({}, { chatId: "chat" })).toBeNull();
  });

  test("treats empty/whitespace-only values as absent, and trims resolved values", () => {
    expect(
      resolveTelegramCredentials(
        { botToken: "  ", chatId: "" },
        { botToken: " file-tok ", chatId: "\tfile-chat\n" },
      ),
    ).toEqual({ botToken: "file-tok", chatId: "file-chat" });
  });
});

describe("parseTelegramCredentialsFile", () => {
  test("reads botToken and chatId from a well-formed file", () => {
    expect(
      parseTelegramCredentialsFile('{ "botToken": "tok", "chatId": "chat" }'),
    ).toEqual({ botToken: "tok", chatId: "chat" });
  });

  test("reads a partial file (only one field present)", () => {
    expect(parseTelegramCredentialsFile('{ "botToken": "tok" }')).toEqual({
      botToken: "tok",
    });
  });

  test("malformed JSON yields no credentials rather than throwing", () => {
    expect(parseTelegramCredentialsFile("not json {")).toEqual({});
  });

  test("a non-object root yields no credentials", () => {
    expect(parseTelegramCredentialsFile('"a string"')).toEqual({});
    expect(parseTelegramCredentialsFile("[1,2,3]")).toEqual({});
    expect(parseTelegramCredentialsFile("null")).toEqual({});
  });

  test("ignores non-string field values", () => {
    expect(
      parseTelegramCredentialsFile('{ "botToken": 123, "chatId": true }'),
    ).toEqual({});
  });
});

describe("serializeTelegramCredentials", () => {
  test("round-trips through the parser", () => {
    const creds = { botToken: "tok", chatId: "chat" };
    expect(parseTelegramCredentialsFile(serializeTelegramCredentials(creds))).toEqual(creds);
  });

  test("ends with a trailing newline", () => {
    expect(serializeTelegramCredentials({ botToken: "t", chatId: "c" })).toMatch(/\n$/);
  });
});

describe("TELEGRAM_CREDENTIALS_FILENAME", () => {
  test("lives inside the machine-managed .diablo runtime dir", () => {
    expect(TELEGRAM_CREDENTIALS_FILENAME).toBe(".diablo/telegram.json");
  });
});
