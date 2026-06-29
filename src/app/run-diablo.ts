/**
 * runDiablo is the top-level orchestrator the CLI calls: it ensures an isolated
 * worktree exists for the issue (resume-aware), loads the issue into an
 * executable pipeline (generating the frozen plan if absent), runs every stage,
 * then optionally integrates the work branch into the target branch. Keeping
 * this here — not in the CLI composition root — keeps main.ts pure wiring and
 * lets the full run be tested against fakes.
 */
import type { AgentPort } from "../ports/agent.ts";
import type { GitPort } from "../ports/git.ts";
import type { GitMergePort } from "../ports/git-merge.ts";
import type { FsPort } from "../ports/fs.ts";
import { loadIssue, type LoadIssueConfig } from "./load-issue.ts";
import { runIssue, type IssueResult } from "./run-issue.ts";
import type { RetryPolicy } from "./run-stage.ts";
import { integrate, type IntegrateResult } from "./integrate.ts";
import { branchName } from "../domain/branch.ts";
import { artifactIgnore } from "../domain/artifact-ignore.ts";
import type { GatePort } from "../ports/gate.ts";
import type { ProgressPort } from "../ports/progress.ts";
import type { RunStepDeps } from "./run-step.ts";

export interface IntegrationConfig {
  targetBranch: string;
  branchPrefix: string;
  autoMerge: boolean;
}

export interface RunDiabloConfig extends LoadIssueConfig {
  baseBranch: string;
  /** Bounded worker-retry policy on implementation FAIL; default no retry. */
  retry?: RetryPolicy;
  /** Branch-integration policy applied after a successful run; omitted = no integration step. */
  integration?: IntegrationConfig;
}

export interface RunDiabloDeps {
  agent: AgentPort;
  git: GitPort;
  fs: FsPort;
  gate?: GatePort;
  /** Required only when config.integration requests a merge. */
  merge?: GitMergePort;
  /** Optional progress sink; structured run events are emitted to it when present. */
  progress?: ProgressPort;
  /** Optional liveness-ticker factory; bracketed around each agent run (see RunStepDeps). */
  heartbeat?: RunStepDeps["heartbeat"];
}

export interface RunDiabloResult extends IssueResult {
  /** The outcome of the integration step, if integration was configured. */
  integration?: IntegrateResult;
}

export async function runDiablo(
  deps: RunDiabloDeps,
  config: RunDiabloConfig,
): Promise<RunDiabloResult> {
  const branch = config.integration
    ? branchName(config.integration.branchPrefix, config.issue)
    : undefined;

  if (!(await deps.fs.exists(config.worktree))) {
    await deps.git.worktreeAdd(config.issue, config.baseBranch, branch);
  }

  // Make diablo's per-run machine artifacts (.plans/: frozen plan, live progress
  // tracker, design notes) uncommittable, so `git add -A` never sweeps them onto
  // the feature branch. Written unconditionally — fresh OR resumed worktree — so
  // an existing worktree from before this guard is retrofitted too. Idempotent.
  const ignore = artifactIgnore(config.worktree);
  await deps.fs.write(ignore.path, ignore.content);

  const issue = await loadIssue(deps, config);

  const result = await runIssue(
    { agent: deps.agent, git: deps.git, gate: deps.gate, progress: deps.progress, heartbeat: deps.heartbeat },
    issue,
    config.retry ?? { limit: 0 },
  );

  // Integrate only after the whole issue passed. The integrate use-case itself
  // enforces autoMerge-off (manual) vs on (merge / detect-and-halt).
  if (config.integration && branch) {
    const mergePort = deps.merge ?? (deps.git as unknown as GitMergePort);
    const integration = await integrate(
      { git: mergePort },
      {
        branch,
        targetBranch: config.integration.targetBranch,
        autoMerge: config.integration.autoMerge,
      },
    );
    return { ...result, integration };
  }

  return result;
}
