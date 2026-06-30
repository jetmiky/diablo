import { describe, expect, test } from "bun:test";
import {
  resolveStdoutCapabilities,
  type CapabilityInputs,
} from "../src/domain/stdout-capabilities.ts";

/** A TTY with no env overrides, no --plain, fun not disabled — the default. */
const tty: CapabilityInputs = {
  isTty: true,
  noColor: false,
  forceColor: false,
  plain: false,
  funOff: false,
};

describe("resolveStdoutCapabilities", () => {
  test("a plain TTY → colour on, animation on, fun on", () => {
    expect(resolveStdoutCapabilities(tty)).toEqual({ colour: true, animate: true, fun: true });
  });

  test("non-TTY (piped/CI) → colour off, animation off, fun off", () => {
    expect(resolveStdoutCapabilities({ ...tty, isTty: false })).toEqual({
      colour: false,
      animate: false,
      fun: false,
    });
  });

  test("--plain forces the plainest output even on a TTY (fun off too)", () => {
    expect(resolveStdoutCapabilities({ ...tty, plain: true })).toEqual({
      colour: false,
      animate: false,
      fun: false,
    });
  });

  test("NO_COLOR disables colour but leaves animation and fun on a TTY", () => {
    expect(resolveStdoutCapabilities({ ...tty, noColor: true })).toEqual({
      colour: false,
      animate: true,
      fun: true,
    });
  });

  test("FORCE_COLOR enables colour on a non-TTY (but not animation or fun)", () => {
    expect(resolveStdoutCapabilities({ ...tty, isTty: false, forceColor: true })).toEqual({
      colour: true,
      animate: false,
      fun: false,
    });
  });

  test("NO_COLOR wins over FORCE_COLOR when both are set", () => {
    expect(resolveStdoutCapabilities({ ...tty, noColor: true, forceColor: true })).toEqual({
      colour: false,
      animate: true,
      fun: true,
    });
  });

  test("--plain wins over FORCE_COLOR", () => {
    expect(resolveStdoutCapabilities({ ...tty, plain: true, forceColor: true })).toEqual({
      colour: false,
      animate: false,
      fun: false,
    });
  });

  test("DIABLO_FUN=0 (funOff) disables fun but leaves colour and animation on a TTY", () => {
    expect(resolveStdoutCapabilities({ ...tty, funOff: true })).toEqual({
      colour: true,
      animate: true,
      fun: false,
    });
  });

  test("fun is never on for a non-TTY even if funOff is not set", () => {
    expect(resolveStdoutCapabilities({ ...tty, isTty: false }).fun).toBe(false);
  });
});
