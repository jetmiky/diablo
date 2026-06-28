import { describe, expect, test } from "bun:test";
import { renderTelegramHtml } from "../src/domain/telegram-html.ts";

/**
 * Telegram's HTML parse mode supports only a small tag subset; everything else
 * must be escaped. Content is full of file paths, SHAs, and code, so escaping
 * (especially <, >, &) must be exact. These tests pin the supported conversions
 * and the escaping of everything else.
 */
describe("renderTelegramHtml", () => {
  test("escapes the HTML-special characters &, <, >", () => {
    expect(renderTelegramHtml("a < b && c > d")).toBe("a &lt; b &amp;&amp; c &gt; d");
  });

  test("renders **bold** as <b>", () => {
    expect(renderTelegramHtml("**done**")).toBe("<b>done</b>");
  });

  test("renders *italic* and _italic_ as <i>", () => {
    expect(renderTelegramHtml("*soon* and _later_")).toBe("<i>soon</i> and <i>later</i>");
  });

  test("renders `inline code` as <code>, escaping its contents", () => {
    expect(renderTelegramHtml("run `tsc --noEmit <x>`")).toBe(
      "run <code>tsc --noEmit &lt;x&gt;</code>",
    );
  });

  test("renders a fenced code block as <pre>, escaping its contents", () => {
    const md = "```\nconst a = b < c;\n```";
    expect(renderTelegramHtml(md)).toBe("<pre>const a = b &lt; c;</pre>");
  });

  test("renders [text](url) as an anchor", () => {
    expect(renderTelegramHtml("[diff](https://x.test/a?b=1&c=2)")).toBe(
      '<a href="https://x.test/a?b=1&amp;c=2">diff</a>',
    );
  });

  test("leaves a bare file path and SHA intact (no accidental markup)", () => {
    expect(renderTelegramHtml("src/main.ts @ a1b2c3d")).toBe("src/main.ts @ a1b2c3d");
  });

  test("does not let code content trigger bold/italic/escape markup", () => {
    expect(renderTelegramHtml("`a**b**c`")).toBe("<code>a**b**c</code>");
  });

  test("renders a heading as bold (Telegram has no heading tag)", () => {
    expect(renderTelegramHtml("## Stage 1")).toBe("<b>Stage 1</b>");
  });
});
