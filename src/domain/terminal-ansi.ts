/**
 * Renders the small markdown subset that `formatEvent` emits into ANSI-styled
 * terminal text — the stdout analogue of `renderTelegramHtml`. The semantic
 * event formatter stays surface-agnostic (it speaks markdown); each sink renders
 * that markdown for its own surface (Telegram → HTML, stdout → ANSI/plain).
 *
 * When `colour` is false (a non-TTY, NO_COLOR, or --plain), the markup is
 * STRIPPED to clean plain text rather than styled, so a piped log carries no
 * escape codes and no leaked `**` asterisks. Pure (no I/O) so it is unit-tested
 * directly.
 */

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

export function renderAnsi(markdown: string, colour: boolean): string {
  // Inline `code` → cyan when colour is on, bare contents (backticks dropped)
  // when off. Done first so a `**` inside backticks is never seen as bold.
  let text = markdown.replace(/`([^`]+)`/g, (_m, body: string) =>
    colour ? `${CYAN}${body}${RESET}` : body,
  );

  // Bold: **text** → ANSI bold when colour is on, bare text when off.
  text = text.replace(/\*\*([^*]+)\*\*/g, (_m, body: string) =>
    colour ? `${BOLD}${body}${RESET}` : body,
  );

  return text;
}
