/**
 * integrate decides what happens to a completed work branch after a run's final
 * PASS. It enforces the project's safety posture:
 *
 *  - autoMerge defaults OFF: a passing verdict is NOT the same as "the human
 *    wants this in main". When off, the branch is left intact and the exact
 *    manual merge command is returned.
 *  - autoMerge on + clean merge: integrate into the target branch.
 *  - autoMerge on + conflict: detect-and-halt — the adapter aborts the merge
 *    cleanly; integrate reports the conflicting files and the manual command.
 *    Conflicts are NEVER auto-resolved (high blast radius, a human decision).
 *
 * Pure orchestration over GitMergePort, so it is unit-tested against a fake.
 */
import type { GitMergePort } from "../ports/git-merge.ts";

export interface IntegrateConfig {
  branch: string;
  targetBranch: string;
  autoMerge: boolean;
}

export interface IntegrateDeps {
  git: GitMergePort;
}

export type IntegrateResult =
  | { status: "merged"; branch: string; targetBranch: string }
  | { status: "manual"; branch: string; targetBranch: string; command: string }
  | { status: "conflict"; branch: string; targetBranch: string; conflicts: string[]; command: string };

export async function integrate(
  deps: IntegrateDeps,
  config: IntegrateConfig,
): Promise<IntegrateResult> {
  const { branch, targetBranch, autoMerge } = config;
  const command = mergeCommand(targetBranch, branch);

  if (!autoMerge) {
    return { status: "manual", branch, targetBranch, command };
  }

  const result = await deps.git.merge(targetBranch, branch);
  if (result.ok) {
    return { status: "merged", branch, targetBranch };
  }
  return { status: "conflict", branch, targetBranch, conflicts: result.conflicts, command };
}

/** The exact command a human runs to merge the branch by hand. */
function mergeCommand(targetBranch: string, branch: string): string {
  return `git checkout ${targetBranch} && git merge --no-ff ${branch}`;
}
