/**
 * Parses a verifier agent's verdict from its final text.
 *
 * A verifier step has no commit to gate on, so its only signal is the text it
 * returns. To give that signal teeth (run-step halts the pipeline on a failing
 * verdict), the verifier is instructed to end its reply with a single line:
 *
 *   VERDICT: PASS   — the committed work meets the stage's acceptance criteria
 *   VERDICT: FAIL   — it does not; the run must stop
 *
 * We read the LAST such line (the agent may quote the format earlier while
 * reasoning) and tolerate surrounding markdown/whitespace. Absent any verdict
 * line we return "none" — run-step treats that as a failure (a silent verifier
 * must never be read as success).
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

export type Verdict = "pass" | "fail" | "none";

const VERDICT_RE = /verdict\s*:\s*(pass|fail)/i;

export function parseVerdict(text: string): Verdict {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = VERDICT_RE.exec(lines[i] ?? "");
    if (match) {
      return match[1]!.toLowerCase() === "pass" ? "pass" : "fail";
    }
  }
  return "none";
}

/**
 * The declarative category attached to a FAIL verdict, governing routing:
 *
 *   [implementation] — the plan is fine, the code is not: retry the worker with
 *                      the verifier's feedback (bounded by config).
 *   [plan]           — the plan itself is wrong: halt to a human; never replan
 *                      mid-run (that would break the frozen-plan guarantee).
 *
 * Read from the LAST verdict line (the verifier may quote the format earlier
 * while reasoning). The default is "implementation" when no category is given —
 * the safe, recoverable route (retry) rather than an immediate human halt. The
 * caller only consults this on a FAIL verdict; for PASS/none it is irrelevant.
 */
export type VerdictCategory = "implementation" | "plan";

const CATEGORY_RE = /verdict\s*:\s*fail\b[^\n[]*\[\s*(implementation|plan)\s*\]/i;

export function parseVerdictCategory(text: string): VerdictCategory {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = CATEGORY_RE.exec(lines[i] ?? "");
    if (match) {
      return match[1]!.toLowerCase() === "plan" ? "plan" : "implementation";
    }
  }
  return "implementation";
}
