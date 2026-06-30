import { describe, expect, test } from "bun:test";
import {
  personaLine,
  verdictLine,
  retryLine,
  flavorText,
  PERSONA_GLYPHS,
} from "../src/domain/persona.ts";

describe("personaLine", () => {
  test("each tier carries its persona glyph", () => {
    expect(personaLine("design", "stage-1", 0)).toContain(PERSONA_GLYPHS.design);
    expect(personaLine("worker", "stage-1", 0)).toContain(PERSONA_GLYPHS.worker);
    expect(personaLine("verifier", "stage-1", 0)).toContain(PERSONA_GLYPHS.verifier);
  });

  test("the line names the stage", () => {
    expect(personaLine("worker", "stage-3", 0)).toContain("stage-3");
  });

  test("rotation is deterministic: same tier+bucket → same phrase", () => {
    expect(personaLine("worker", "stage-1", 4)).toBe(personaLine("worker", "stage-1", 4));
  });

  test("different buckets can select different phrases (rotation actually moves)", () => {
    // Collect the phrases across a full rotation; there must be more than one
    // distinct phrasing or the rotation is pointless.
    const phrases = new Set(
      Array.from({ length: 12 }, (_, b) => personaLine("verifier", "stage-1", b)),
    );
    expect(phrases.size).toBeGreaterThan(1);
  });

  test("verifier phrasing stays skeptical (anti-sycophancy posture)", () => {
    const all = Array.from({ length: 12 }, (_, b) => personaLine("verifier", "stage-1", b)).join(
      " ",
    );
    expect(all).toMatch(/poking holes|calling its bluff|checking the work/i);
  });
});

describe("verdictLine", () => {
  test("a pass carries upbeat personality and the stage", () => {
    const line = verdictLine("pass", "stage-2");
    expect(line).toContain("stage-2");
    expect(line).toMatch(/nailed it/i);
  });

  test("a fail carries back-to-the-bench personality", () => {
    expect(verdictLine("fail", "stage-2")).toMatch(/back to the bench|not yet/i);
  });
});

describe("retryLine", () => {
  test("names the attempt number with personality", () => {
    const line = retryLine("stage-1", 2);
    expect(line).toContain("stage-1");
    expect(line).toMatch(/2/);
  });
});

describe("flavorText", () => {
  test("is deterministic for a given stage + bucket (no per-tick flicker)", () => {
    expect(flavorText("stage-1", 3)).toBe(flavorText("stage-1", 3));
  });

  test("rotates across buckets", () => {
    const phrases = new Set(Array.from({ length: 12 }, (_, b) => flavorText("stage-1", b)));
    expect(phrases.size).toBeGreaterThan(1);
  });
});
