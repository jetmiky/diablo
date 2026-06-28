/**
 * runDiablo is the top-level orchestrator the CLI calls: it ensures an isolated
 * worktree exists for the issue (resume-aware), loads the issue into an
 * executable pipeline (generating the frozen plan if absent), then runs every
 * stage. Keeping this here — not in the CLI composition root — keeps main.ts
 * pure wiring and lets the full run be tested against fakes.
 */
import type { AgentPort } from "../ports/agent.ts";
import type { GitPort } from "../ports/git.ts";
import type { FsPort } from "../ports/fs.ts";
import { loadIssue, type LoadIssueConfig } from "./load-issue.ts";
import { runIssue, type IssueResult } from "./run-issue.ts";
import type { RetryPolicy } from "./run-stage.ts";
import type { GatePort } from "../ports/gate.ts";

export interface RunDiabloConfig extends LoadIssueConfig {
  baseBranch: string;
  /** Bounded worker-retry policy on implementation FAIL; default no retry. */
  retry?: RetryPolicy;
}

export interface RunDiabloDeps {
  agent: AgentPort;
  git: GitPort;
  fs: FsPort;
  gate?: GatePort;
}

export async function runDiablo(deps: RunDiabloDeps, config: RunDiabloConfig): Promise<IssueResult> {
  if (!(await deps.fs.exists(config.worktree))) {
    await deps.git.worktreeAdd(config.issue, config.baseBranch);
  }

  const issue = await loadIssue(deps, config);

  return runIssue(
    { agent: deps.agent, git: deps.git, gate: deps.gate },
    issue,
    config.retry ?? { limit: 0 },
  );
}
