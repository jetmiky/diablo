/**
 * Renders a small markdown subset into Telegram's HTML parse-mode subset.
 *
 * Telegram HTML supports only: <b>, <i>, <u>, <s>, <code>, <pre>, <a href>.
 * Everything else must be escaped — and diablo's messages are full of file
 * paths, SHAs, and code, so getting <, >, & right is the whole game. HTML is
 * chosen over MarkdownV2 because MarkdownV2's escaping is brittle for exactly
 * that kind of content (this matches the approach used in pigram).
 *
 * Strategy: extract code blocks and inline code FIRST (their contents are
 * escaped but never interpreted as markup), substituting placeholders; apply
 * the inline rules (bold/italic/link/heading) and escape the rest; then restore
 * the code segments. Pure (no I/O) so it is unit-tested directly.
 */

export function renderTelegramHtml(markdown: string): string {
  const segments: string[] = [];
  const placeholder = (i: number) => `\u0000${i}\u0000`;

  // 1. Fenced code blocks → <pre>, contents escaped. Stashed first so their
  //    bodies are never touched by inline rules or outer escaping.
  let text = markdown.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, body: string) => {
    const i = segments.push(`<pre>${escapeHtml(stripTrailingNewline(body))}</pre>`) - 1;
    return placeholder(i);
  });

  // 2. Inline code → <code>, contents escaped.
  text = text.replace(/`([^`]+)`/g, (_m, body: string) => {
    const i = segments.push(`<code>${escapeHtml(body)}</code>`) - 1;
    return placeholder(i);
  });

  // 3. Links [text](url): stash the rendered anchor (text + url escaped).
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    const i = segments.push(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`) - 1;
    return placeholder(i);
  });

  // 4. Escape everything else, then apply the inline emphasis rules on the
  //    now-safe text (escaping first means markup we add is the only markup).
  text = escapeHtml(text);
  text = text.replace(/^#{1,6}\s+(.*)$/gm, (_m, h: string) => `<b>${h.trim()}</b>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>");
  text = text.replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, "$1<i>$2</i>");

  // 5. Restore the stashed code/link segments.
  return text.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => segments[Number(i)]!);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripTrailingNewline(s: string): string {
  return s.replace(/\n$/, "");
}
