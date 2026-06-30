/**
 * isNothingToCheck recognises a gate command that failed ONLY because there was
 * nothing for it to check yet — not because the code is wrong. In a TDD-staged
 * plan an early stage legitimately precedes its source or test files, so:
 *
 *   - `tsc --noEmit` emits TS18003 ("No inputs were found") when zero files
 *     match its include globs. tsc emits this ONLY in the empty-input case; it
 *     never coexists with a real type error, so matching it cannot mask one.
 *   - `bun test` prints "No tests found!" and exits non-zero when the suite is
 *     empty — the measured twin of the existing EMPTY_SUITE_NOTE prompt carve-out.
 *
 * ADR 0001 made the MEASURED exit code authoritative (a green LLM verdict cannot
 * override a non-zero gate). That is correct for real failures but wrong for the
 * empty-tree state, where the non-zero exit means "nothing here yet", not "the
 * code is broken". This predicate lets the gate treat that one state as
 * pass-equivalent, scoped tightly so a genuine type error or failing test still
 * FAILs.
 *
 * Defensive scoping: TS18003 only counts as nothing-to-check when it is the SOLE
 * TypeScript diagnostic — if any other `error TSxxxx` is present, real work is
 * being checked and the gate must fail.
 *
 * Pure (string in, boolean out) so it is unit-tested directly.
 */

/** tsc's "no inputs were found" diagnostic — emitted only on an empty input set. */
const TS_NO_INPUTS_RE = /error TS18003\b/;

/** Any tsc diagnostic of the form `error TSxxxx` (TS18003 included). */
const TS_DIAGNOSTIC_RE = /error TS\d+\b/g;

/** bun's empty-suite signal: it prints this and exits non-zero with no tests. */
const NO_TESTS_FOUND_RE = /no tests found/i;

export function isNothingToCheck(output: string | undefined): boolean {
  if (!output) return false;

  // Empty test suite: bun reports "No tests found!" and exits non-zero.
  if (NO_TESTS_FOUND_RE.test(output)) return true;

  // Empty typecheck: tsc reports TS18003 AND nothing else. If any other TS
  // diagnostic is present, real source is being checked — not a nothing state.
  if (TS_NO_INPUTS_RE.test(output)) {
    const diagnostics = output.match(TS_DIAGNOSTIC_RE) ?? [];
    const onlyNoInputs = diagnostics.every((d) => /TS18003\b/.test(d));
    return onlyNoInputs;
  }

  return false;
}
