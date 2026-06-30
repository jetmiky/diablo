import { describe, expect, test } from "bun:test";
import { colourByElapsed } from "../src/domain/elapsed-colour.ts";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

// A 20-minute ceiling (the default stepTimeoutMs), in ms.
const CEILING = 20 * 60 * 1000;

describe("colourByElapsed", () => {
  test("under 50% of the ceiling → green", () => {
    expect(colourByElapsed("5m", 5 * 60 * 1000, CEILING, true)).toBe(`${GREEN}5m${RESET}`);
  });

  test("between 50% and 80% → yellow", () => {
    expect(colourByElapsed("12m", 12 * 60 * 1000, CEILING, true)).toBe(`${YELLOW}12m${RESET}`);
  });

  test("over 80% of the ceiling → red (about to be killed)", () => {
    expect(colourByElapsed("18m", 18 * 60 * 1000, CEILING, true)).toBe(`${RED}18m${RESET}`);
  });

  test("exactly at the 50% boundary is yellow (band is 50–80%, inclusive)", () => {
    expect(colourByElapsed("10m", 10 * 60 * 1000, CEILING, true)).toBe(`${YELLOW}10m${RESET}`);
  });

  test("colour off → the text is returned unstyled", () => {
    expect(colourByElapsed("18m", 18 * 60 * 1000, CEILING, false)).toBe("18m");
  });

  test("a non-positive ceiling never divides by zero → green (no ceiling to approach)", () => {
    expect(colourByElapsed("5m", 5 * 60 * 1000, 0, true)).toBe(`${GREEN}5m${RESET}`);
  });
});
