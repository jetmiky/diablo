import { describe, expect, test } from "bun:test";
import {
  resolveStdoutCapabilities,
  type CapabilityInputs,
} from "../src/domain/stdout-capabilities.ts";

/** A TTY with no env overrides and no --plain — the default interactive case. */
const tty: CapabilityInputs = { isTty: true, noColor: false, forceColor: false, plain: false };

describe("resolveStdoutCapabilities", () => {
  test("a plain TTY → colour on, animation on", () => {
    expect(resolveStdoutCapabilities(tty)).toEqual({ colour: true, animate: true });
  });

  test("non-TTY (piped/CI) → colour off, animation off", () => {
    expect(resolveStdoutCapabilities({ ...tty, isTty: false })).toEqual({
      colour: false,
      animate: false,
    });
  });

  test("--plain forces the plainest output even on a TTY", () => {
    expect(resolveStdoutCapabilities({ ...tty, plain: true })).toEqual({
      colour: false,
      animate: false,
    });
  });

  test("NO_COLOR disables colour but leaves animation on a TTY", () => {
    expect(resolveStdoutCapabilities({ ...tty, noColor: true })).toEqual({
      colour: false,
      animate: true,
    });
  });

  test("FORCE_COLOR enables colour on a non-TTY (but not animation)", () => {
    expect(resolveStdoutCapabilities({ ...tty, isTty: false, forceColor: true })).toEqual({
      colour: true,
      animate: false,
    });
  });

  test("NO_COLOR wins over FORCE_COLOR when both are set", () => {
    expect(
      resolveStdoutCapabilities({ ...tty, noColor: true, forceColor: true }),
    ).toEqual({ colour: false, animate: true });
  });

  test("--plain wins over FORCE_COLOR", () => {
    expect(
      resolveStdoutCapabilities({ ...tty, plain: true, forceColor: true }),
    ).toEqual({ colour: false, animate: false });
  });
});
