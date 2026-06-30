import { describe, expect, test } from "bun:test";
import { activityGlyph } from "../src/domain/activity-glyph.ts";

describe("activityGlyph", () => {
  test("maps each known activity verb to a distinguishing glyph", () => {
    expect(activityGlyph("editing run-step.ts")).toBe("✏️");
    expect(activityGlyph("reading config.ts")).toBe("📖");
    expect(activityGlyph("writing plan.md")).toBe("📝");
    expect(activityGlyph("running `bun test`")).toBe("⚡");
    expect(activityGlyph("searching for “TODO”")).toBe("🔍");
    expect(activityGlyph("finding “*.ts”")).toBe("🧭");
    expect(activityGlyph("listing src")).toBe("📂");
  });

  test("a non-verb label (a thought or flavor text) falls back to the thinking glyph", () => {
    // pi-activity always emits a known leading verb (unknown tools become
    // `running <tool>` → ⚡), so a label with no known verb is a Pi thought or
    // flavor text — 💭 reads better there than a generic gear.
    expect(activityGlyph("Let me check the parser")).toBe("💭");
    expect(activityGlyph("frobnicating widgets")).toBe("💭");
  });

  test("matches the leading verb case-insensitively and ignores extra prose", () => {
    expect(activityGlyph("Editing something")).toBe("✏️");
  });

  test("an empty or whitespace label gets the thinking glyph (never throws)", () => {
    expect(activityGlyph("")).toBe("💭");
    expect(activityGlyph("   ")).toBe("💭");
  });
});
