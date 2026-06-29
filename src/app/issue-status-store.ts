/**
 * Persists run-lifecycle status as gitignored runtime state at
 * .diablo/<issue>/state.json (NOT in the issue markdown — that keeps the
 * triage label intact). .diablo/ is already gitignored.
 *
 * A missing or malformed state file must never crash a listing — always falls
 * back to DEFAULT_STATUS ("open"). The state.json shape and path are an
 * implementation detail behind these two functions.
 */
import type { FsPort } from "../ports/fs.ts";
import { DEFAULT_STATUS, isIssueStatus, type IssueStatus } from "../domain/issue-status.ts";

export interface IssueStatusStoreDeps {
  fs: FsPort;
}

export async function readStatus(
  deps: IssueStatusStoreDeps,
  opts: { diabloDir: string; issue: string },
): Promise<IssueStatus> {
  const path = statePath(opts.diabloDir, opts.issue);

  try {
    const content = await deps.fs.read(path);
    const json = JSON.parse(content);
    const status = json.status;

    if (isIssueStatus(status)) {
      return status;
    }
    // Unknown status value — fall back to default
    return DEFAULT_STATUS;
  } catch {
    // Missing file or malformed JSON — fall back to default
    return DEFAULT_STATUS;
  }
}

export async function writeStatus(
  deps: IssueStatusStoreDeps,
  opts: { diabloDir: string; issue: string; status: IssueStatus },
): Promise<void> {
  const path = statePath(opts.diabloDir, opts.issue);
  const data = {
    status: opts.status,
    updatedAt: new Date().toISOString(),
  };
  const content = JSON.stringify(data, null, 2);
  await deps.fs.write(path, content);
}

function statePath(diabloDir: string, issue: string): string {
  return `${diabloDir}/${issue}/state.json`;
}
