/**
 * loadIssue turns a ticket into an executable Issue. It is resume-aware:
 *
 *  - If the frozen plan already exists, it is reused (honoring the master-plan
 *    skill's "frozen, never edited" rule) — no planner run.
 *  - Otherwise a planner-high step runs with the master-plan skill and the
 *    ticket(s) injected, which writes the frozen plan file; that file is then
 *    parsed and mapped into the issue pipeline.
 *
 * The pure parts (parse, map) are tested directly; this use-case sequences the
 * I/O around them and is tested against in-memory fakes.
 */
import type { AgentPort } from "../ports/agent.ts";
import type { GitPort } from "../ports/git.ts";
import type { FsPort } from "../ports/fs.ts";
import type { RunSpec } from "../domain/run-spec.ts";
import { parsePlan } from "../domain/plan.ts";
import { planToIssue } from "./plan-to-issue.ts";
import type { Issue } from "./run-issue.ts";

export interface LoadIssueConfig {
  issue: string;
  worktree: string;
  /** Ticket file(s) under .scratch, injected as inputs to the planner. */
  ticketPaths: string[];
  /** Absolute path where the frozen plan lives / will be written. */
  planPath: string;
  skills: {
    planner: string[];
    worker: string[];
    verifier: string[];
  };
}

export interface LoadIssueDeps {
  agent: AgentPort;
  git: GitPort;
  fs: FsPort;
}

export async function loadIssue(deps: LoadIssueDeps, config: LoadIssueConfig): Promise<Issue> {
  if (!(await deps.fs.exists(config.planPath))) {
    await generatePlan(deps, config);
    if (!(await deps.fs.exists(config.planPath))) {
      throw new Error(
        `Planner ran but the plan file was not written at ${config.planPath}. ` +
          `Expected the master-plan step to create it.`,
      );
    }
  }

  const markdown = await deps.fs.read(config.planPath);
  const plan = parsePlan(markdown);

  return planToIssue(plan, {
    issue: config.issue,
    worktree: config.worktree,
    planPath: config.planPath,
    skills: { worker: config.skills.worker, verifier: config.skills.verifier },
  });
}

async function generatePlan(deps: LoadIssueDeps, config: LoadIssueConfig): Promise<void> {
  const spec: RunSpec = {
    tier: "planner-high",
    issue: config.issue,
    stage: "plan",
    skills: config.skills.planner,
    inputs: config.ticketPaths,
    instruction:
      `Create the frozen master plan for this issue following the master-plan skill. ` +
      `Break the ticket(s) into sequenced stages and T-00X tasks, and write the plan to ` +
      `${config.planPath}.`,
    worktree: config.worktree,
  };
  await deps.agent.run(spec);
}
