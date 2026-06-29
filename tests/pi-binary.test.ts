import { describe, expect, test } from "bun:test";
import { resolvePiBinary } from "../src/domain/pi-binary.ts";

/**
 * resolvePiBinary decides which Pi executable diablo spawns. The rule must work
 * for users who installed Pi via ANY package manager (npm, bun, pnpm) — each
 * puts the binary in a different global bin dir — plus an explicit override for
 * off-PATH installs. Pure: the env is injected, so no real process env is read.
 */
describe("resolvePiBinary", () => {
  test("defaults to the bare name 'pi' so node:child_process resolves it via PATH", () => {
    // A slash-less command is resolved against $PATH by spawn (execvp), which is
    // what makes a global install on PATH work regardless of the manager used.
    expect(resolvePiBinary({})).toBe("pi");
  });

  test("uses DIABLO_PI_BIN when set (escape hatch for an off-PATH install)", () => {
    expect(resolvePiBinary({ DIABLO_PI_BIN: "/opt/pi/bin/pi" })).toBe("/opt/pi/bin/pi");
  });

  test("trims surrounding whitespace from the override", () => {
    expect(resolvePiBinary({ DIABLO_PI_BIN: "  /opt/pi/bin/pi  " })).toBe("/opt/pi/bin/pi");
  });

  test("falls back to 'pi' when the override is empty or whitespace-only", () => {
    expect(resolvePiBinary({ DIABLO_PI_BIN: "" })).toBe("pi");
    expect(resolvePiBinary({ DIABLO_PI_BIN: "   " })).toBe("pi");
  });
});
