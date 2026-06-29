/**
 * After `husky init`, husky writes a default `.husky/pre-commit` containing
 * `bun test` (or `npm test`). In a project freshly scaffolded by `diablo init`
 * there are no tests yet, so that hook FAILS the very first commit (bun test
 * exits 1 on "no tests found"), which aborts the worker's worktree commit and
 * STALLS diablo's autonomous loop. Worse, the loop runs TDD: a deliberately-RED
 * commit would be blocked by a test-running pre-commit hook even when correct.
 *
 * So diablo owns its hook artifacts, overwriting husky's defaults:
 *   - pre-commit runs NO tests. Correctness is the verifier's job in the
 *     pipeline; the git hook must never deadlock the AFK loop. A human who
 *     wants a local test gate can add it back themselves.
 *   - commit-msg runs commitlint, which is what husky init never wired up.
 *     commitlint validates the commit MESSAGE, which only exists in the
 *     commit-msg hook (pre-commit runs before the message is written).
 *   - commitlint.config.js is scaffolded because commitlint requires a config.
 *
 * Pure (manager in, artifacts out) so the content is unit-tested directly; the
 * caller writes each artifact to disk after `husky init` has created .husky/.
 */
import type { PackageManager } from "./package-manager.ts";

/** A file diablo writes verbatim, relative to the project root. */
export interface HuskyArtifact {
  /** Path relative to the repo root (e.g. ".husky/commit-msg"). */
  path: string;
  /** Full file content. */
  content: string;
}

/** The runner that executes a locally-installed bin for each package manager. */
const BIN_RUNNER: Record<PackageManager, string> = {
  bun: "bunx",
  npm: "npx",
  pnpm: "pnpm exec",
};

/**
 * The hook + config artifacts diablo writes after `husky init`, overwriting
 * husky's test-running default pre-commit and adding the commit-msg hook and
 * commitlint config that init never creates.
 */
export function huskyArtifacts(pm: PackageManager): HuskyArtifact[] {
  const runner = BIN_RUNNER[pm];
  return [
    {
      // No test run here — see module doc. A no-op that exits 0 so the hook is
      // present (and obvious where to add checks) without ever blocking a commit.
      path: ".husky/pre-commit",
      content:
        `# diablo: intentionally does NOT run tests — the verifier gates correctness\n` +
        `# in the pipeline, so this hook never deadlocks the autonomous loop.\n` +
        `# Add project-local pre-commit checks below if you want them.\n`,
    },
    {
      path: ".husky/commit-msg",
      content: `${runner} commitlint --edit $1\n`,
    },
    {
      path: "commitlint.config.js",
      content: `export default { extends: ['@commitlint/config-conventional'] };\n`,
    },
  ];
}
