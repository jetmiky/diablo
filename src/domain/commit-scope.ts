/**
 * Commit-scope enforcement for the worker step. The worker commits with
 * `git add -A`, which can sweep in files beyond the task's declared scope —
 * stray debug output, scratch files, or edits far outside the plan. For an
 * unattended (AFK) run, that scope creep would land silently.
 *
 * This computes which committed files fall OUTSIDE the task's declared
 * `Target Files`, so the run can surface them (warn-not-block, per the project's
 * stance). It is deliberately lenient in two ways:
 *
 *  - Test files are always in scope: TDD writes tests alongside the target, and
 *    the plan's Target Files name production files, not their tests.
 *  - An empty declared set disables enforcement (returns no strays): with no
 *    Target Files to scope against, flagging everything would be noise. The
 *    hard exclusion of diablo's own `.plans/` artifacts is handled separately
 *    (see domain/artifact-ignore.ts), not here.
 *
 * Pure (two string lists in, a list out) so it is unit-tested directly; the
 * caller obtains the committed-files list from the GitPort and decides how to
 * surface the result.
 */

/** A test file is in scope regardless of the declared targets (TDD pairing). */
function isTestFile(path: string): boolean {
  return /(^|\/)tests?\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function clean(list: readonly string[]): string[] {
  return list.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Returns the committed files that are neither a declared target nor a test
 * file, in commit order, de-duplicated. An empty `declared` list yields an empty
 * result (enforcement disabled — nothing to scope against).
 */
export function outOfScopeFiles(
  declared: readonly string[],
  committed: readonly string[],
): string[] {
  const targets = new Set(clean(declared));
  if (targets.size === 0) return [];

  const strays: string[] = [];
  const seen = new Set<string>();
  for (const file of clean(committed)) {
    if (targets.has(file) || isTestFile(file) || seen.has(file)) continue;
    seen.add(file);
    strays.push(file);
  }
  return strays;
}
