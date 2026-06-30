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

  test("an unknown verb falls back to a generic gear glyph", () => {
    // pi-activity emits `running <tool>` for unknown tools, which maps to ⚡;
    // a truly unrecognised label (no known leading verb) gets the gear.
    expect(activityGlyph("frobnicating widgets")).toBe("⚙️");
  });

  test("matches the leading verb case-insensitively and ignores extra prose", () => {
    expect(activityGlyph("Editing something")).toBe("✏️");
  });

  test("an empty or whitespace label gets the generic glyph (never throws)", () => {
    expect(activityGlyph("")).toBe("⚙️");
    expect(activityGlyph("   ")).toBe("⚙️");
  });
});
