/**
 * The work-branch naming rule: a configured prefix plus the issue ref. Pure so
 * it is unit-tested directly and shared by the worktree adapter and the
 * integration step, which must agree on the branch a run produced.
 */
export function branchName(prefix: string, issue: string): string {
  return `${prefix}${issue}`;
}
