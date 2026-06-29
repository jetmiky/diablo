#!/usr/bin/env node
/**
 * Composition root for the diablo CLI. Wiring only — no business logic.
 * Parses argv, then dispatches. Real adapters (PiAgent + NodeProcessRunner,
 * GitCli, StdinGate) are assembled here and injected into the use-cases.
 */
import { parseArgs } from "./args.ts";
import { readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { resolveSkillsDir, skillFile } from "../domain/skills-path.ts";
import { resolvePiBinary } from "../domain/pi-binary.ts";
import { PiAgent } from "../adapters/pi-agent.ts";
import { NodeProcessRunner } from "../adapters/node-process-runner.ts";
import { GitCli } from "../adapters/git-cli.ts";
import { StdinGate } from "../adapters/stdin-gate.ts";
import { NodeFs } from "../adapters/node-fs.ts";
import { runDiablo, type RunDiabloConfig, type RunDiabloDeps, type RunDiabloResult } from "../app/run-diablo.ts";
import { loadConfig } from "../app/load-config.ts";
import { initDiablo } from "../app/init-diablo.ts";
import { intakeDiablo, type GrillContext } from "../app/intake-diablo.ts";
import { intakeSessionId, buildIntakeArgs } from "../domain/intake-spec.ts";
import { resolveModels, type ConfigModels, type DiabloConfig } from "../domain/config.ts";
import { bootstrapCommands, type PackageManager } from "../domain/package-manager.ts";
import { huskyArtifacts } from "../domain/husky-hooks.ts";
import { StdinPrompt } from "../adapters/stdin-prompt.ts";
import { StdoutProgress } from "../adapters/stdout-progress.ts";
import { ProgressMdAdapter } from "../adapters/progress-md.ts";
import { TelegramProgress } from "../adapters/telegram-progress.ts";
import { TelegramBotClient } from "../adapters/telegram-bot-client.ts";
import { FanOutProgress } from "../adapters/fan-out-progress.ts";
import { GateDeclinedError, type GateMode } from "../ports/gate.ts";
import type { ProgressPort } from "../ports/progress.ts";
import type { ModelOverrides } from "../domain/run-spec.ts";
import { enrichIssues } from "../app/enrich-issues.ts";
import { negotiatePlan } from "../app/negotiate-plan.ts";
import { finalizeIssue } from "../app/finalize-issue.ts";
import { readStatus, writeStatus } from "../app/issue-status-store.ts";
import { listFor, type SelectorContext } from "../domain/issue-listing.ts";
import { VerificationFailedError } from "../app/run-step.ts";

const VERSION = "0.1.0";

const HELP = `diablo ${VERSION} — a skill-driven Pi conductor

Usage:
  diablo init            Scaffold diablo.config.json and set up skills
  diablo intake <feature> Gather requirements (grill → PRD → issues), interactive
  diablo plan [issue]    Negotiate a plan with the planner, then freeze it
  diablo run [issue]     Run an issue's stages through the agent pipeline
  diablo refactor <area> Refactor an area (same pipeline, refactor planner skill)
  diablo --version       Print the version
  diablo --help          Show this help

When 'plan' or 'run' is invoked with no issue, an interactive selector lists the
discovered issues (requires a terminal; in a non-interactive context, pass the
issue name explicitly).

Run options (override diablo.config.json, which overrides built-in defaults):
  --planner-model <m>    Override the planner model (e.g. claude-sonnet-4.5)
  --worker-model <m>     Override the worker model (e.g. claude-haiku-4.5)
  --verifier-model <m>   Override the verifier model (e.g. claude-opus-4.8)
`;

const CONFIG_FILENAME = "diablo.config.json";

/**
 * The vendored skills directory, resolved from THIS module's own location (not
 * the target project's cwd). `diablo run` executes inside an arbitrary project,
 * so the skills must be found relative to the diablo package — walking up from
 * the compiled module (dist/) or the source module (src/cli/) until `skills/`
 * is found. This is what makes a fresh clone / npm install self-contained.
 */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolveSkillsDir(MODULE_DIR, (p) => existsSync(p));

/**
 * Resolves a ticket location into concrete file paths for @-injection. Pi's
 * @file reads files, not directories (a directory crashes it with EISDIR), so
 * a directory is expanded to the .md files directly inside it.
 */
function resolveTicketPaths(location: string): string[] {
  let isDir = false;
  try {
    isDir = statSync(location).isDirectory();
  } catch {
    return [location]; // let the downstream read surface a clear ENOENT
  }
  if (!isDir) return [location];
  return readdirSync(location)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => `${location}/${name}`);
}

/**
 * Discovers the candidate issue targets under .scratch/ — the immediate entries
 * (a subdirectory of ticket files, or a single .md ticket). This is the same
 * `.scratch/<issue>` convention `run <issue>` resolves against, so the selector
 * offers exactly what `run`/`plan` can target. Returns sorted names with any
 * trailing .md stripped (so the selection round-trips back to a target).
 */
function discoverIssues(repoRoot: string): string[] {
  const scratch = `${repoRoot}/.scratch`;
  let entries: string[];
  try {
    entries = readdirSync(scratch);
  } catch {
    return [];
  }
  return entries
    .filter((name) => !name.startsWith("."))
    .map((name) => (name.endsWith(".md") ? name.slice(0, -3) : name))
    .sort();
}

function buildDeps(
  repoRoot: string,
  overrides: ModelOverrides,
  runId: string,
  progress: RunDiabloDeps["progress"],
): RunDiabloDeps {
  const runner = new NodeProcessRunner();
  const piBinary = resolvePiBinary(process.env);
  return {
    agent: new PiAgent(piBinary, runner, overrides, runId),
    git: new GitCli(repoRoot, runner),
    fs: new NodeFs(),
    gate: new StdinGate(),
    progress,
  };
}

/**
 * Assembles the progress sinks: stdout (always), a live progress.md tracker in
 * the worktree (always), and a Telegram push sink IFF credentials are present
 * in the environment (DIABLO_TELEGRAM_BOT_TOKEN + DIABLO_TELEGRAM_CHAT_ID). No
 * credentials are read from config or committed; absent them, Telegram is just
 * skipped. The fan-out swallows any sink failure so progress never halts a run.
 */
function buildProgress(progressPath: string, issue: string): FanOutProgress {
  const sinks: ProgressPort[] = [new StdoutProgress(), new ProgressMdAdapter(new NodeFs(), progressPath, issue)];

  const token = process.env.DIABLO_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.DIABLO_TELEGRAM_CHAT_ID;
  if (token && chatId) {
    sinks.push(new TelegramProgress(new TelegramBotClient(token, chatId)));
  }

  return new FanOutProgress(sinks);
}

/**
 * A unique id for this invocation, embedded in every step's Pi session-id. Pi
 * resumes an existing session-id, so without this a re-run would resume the
 * previous run's transcript and the agent would do nothing ("already done").
 * Timestamp-based so it is readable and sortable; the frozen plan on disk — not
 * the Pi session — remains the durable handoff, so a fresh runId on resume is
 * correct.
 */
function newRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/[TZ]/g, "");
}

/**
 * Builds per-tier model overrides from the RESOLVED model names (built-in <-
 * config <- CLI flag, computed by resolveModels). Only the model name is
 * swapped; each tier keeps its default thinking level (planner-high → high,
 * planner-med → medium, worker/verifier → medium), so pointing a tier at a
 * smaller model never loses the tier's thinking budget.
 */
function buildOverrides(models: ConfigModels): ModelOverrides {
  return {
    "planner-high": { model: models.planner, thinking: "high" },
    "planner-med": { model: models.planner, thinking: "medium" },
    worker: { model: models.worker, thinking: "medium" },
    verifier: { model: models.verifier, thinking: "medium" },
  };
}

/** Which planner flow a run uses — implementation (master-plan) or refactor. */
interface PlannerFlow {
  /** The vendored skill name injected into the planner step. */
  skill: string;
  /** The prose instruction handed to the planner. */
  instruction: (planPath: string) => string;
  /** Where the planner's input ticket(s) come from, relative to the repo. */
  ticketPaths: (repoRoot: string, target: string) => string[];
  /** The plan filename stem under the worktree's .plans dir. */
  planStem: string;
}

const MASTER_PLAN_FLOW: PlannerFlow = {
  skill: "master-plan",
  instruction: (planPath) =>
    `Create the frozen master plan for this issue following the master-plan skill. ` +
    `Break the ticket(s) into sequenced stages and T-00X tasks, and write the plan to ${planPath}.`,
  ticketPaths: (repoRoot, issue) => resolveTicketPaths(`${repoRoot}/.scratch/${issue}`),
  planStem: "plan",
};

const REFACTOR_FLOW: PlannerFlow = {
  skill: "improve-codebase-architecture",
  instruction: (planPath) =>
    `Create a frozen refactor plan for the target area following the ` +
    `improve-codebase-architecture skill. Identify deepening opportunities, then break the ` +
    `refactor into sequenced stages and T-00X tasks (each a safe, test-backed slice), and write ` +
    `the plan to ${planPath}. End with a final "Verification" stage.`,
  // A refactor's "ticket" is the area description in .scratch/<area>/ if present;
  // resolveTicketPaths falls back to the path itself so a missing dir surfaces clearly.
  ticketPaths: (repoRoot, area) => resolveTicketPaths(`${repoRoot}/.scratch/${area}`),
  planStem: "refactor-plan",
};

function buildRunConfig(
  repoRoot: string,
  target: string,
  skillsDir: string,
  retry: { limit: number },
  integration: { targetBranch: string; branchPrefix: string; autoMerge: boolean },
  gate: GateMode,
  flow: PlannerFlow,
): RunDiabloConfig {
  const worktree = `${repoRoot}/.worktrees/${target}`;
  const planPath = `${worktree}/.plans/${target}-${flow.planStem}.md`;
  return {
    issue: target,
    baseBranch: integration.targetBranch,
    worktree,
    retry,
    integration,
    gate,
    ticketPaths: flow.ticketPaths(repoRoot, target),
    planPath,
    plannerInstruction: flow.instruction(planPath),
    skills: {
      planner: [skillFile(skillsDir, flow.skill)],
      designer: [skillFile(skillsDir, "tdd")],
      worker: [skillFile(skillsDir, "tdd")],
      verifier: [],
    },
  };
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  switch (parsed.command) {
    case "version":
      process.stdout.write(`${VERSION}\n`);
      return 0;

    case "help":
      process.stdout.write(HELP);
      return 0;

    case "error":
      process.stderr.write(`error: ${parsed.message}\n\n${HELP}`);
      return 2;

    case "init": {
      const repoRoot = process.cwd();
      const configPath = `${repoRoot}/${CONFIG_FILENAME}`;
      const gitignorePath = `${repoRoot}/.gitignore`;
      const runner = new NodeProcessRunner();
      const piBinary = resolvePiBinary(process.env);
      await initDiablo(
        {
          fs: new NodeFs(),
          prompt: new StdinPrompt(),
          hasCommits: () => hasCommits(runner, repoRoot),
          setupSkills: () => runSetupSkills(piBinary, runner, repoRoot),
          gitInit: () => gitInit(runner, repoRoot),
          installTooling: (pm) => installTooling(runner, repoRoot, pm),
        },
        { configPath, gitignorePath },
      );
      process.stdout.write(`\n✅ diablo initialized in ${repoRoot}\n`);
      return 0;
    }

    case "run": {
      const flags = {
        plannerModel: parsed.plannerModel,
        workerModel: parsed.workerModel,
        verifierModel: parsed.verifierModel,
      };
      const issue = parsed.issue ?? (await selectIssue("run"));
      if (issue === undefined) return 2;
      return executeRun(issue, flags, MASTER_PLAN_FLOW, "issue");
    }

    case "plan": {
      const flags = {
        plannerModel: parsed.plannerModel,
        workerModel: parsed.workerModel,
        verifierModel: parsed.verifierModel,
      };
      const issue = parsed.issue ?? (await selectIssue("plan"));
      if (issue === undefined) return 2;
      return executePlan(issue, flags);
    }

    case "refactor": {
      const flags = {
        plannerModel: parsed.plannerModel,
        workerModel: parsed.workerModel,
        verifierModel: parsed.verifierModel,
      };
      return executeRun(parsed.area, flags, REFACTOR_FLOW, "refactor of");
    }

    case "intake": {
      return executeIntake(parsed.feature);
    }
  }
}

/**
 * The diablo runtime-state dir — gitignored, machine-managed. Issue lifecycle
 * status lives at .diablo/<issue>/state.json (never in the issue markdown,
 * which carries the human triage label).
 */
function diabloDirFor(repoRoot: string): string {
  return `${repoRoot}/.diablo`;
}

/**
 * Resolves an optional issue arg into a concrete target. With no arg, opens an
 * interactive selector: discovers issues under .scratch/, enriches each with
 * its lifecycle status + merged-state, filters to what the context can act on
 * (plan: not-yet-done; run: planned/open), and prompts a numbered choice.
 *
 * No-TTY = fail-fast: a selector needs a terminal, so in a non-interactive
 * context (backgrounded, piped) it prints a clear error and returns undefined
 * rather than hanging on input that will never arrive — critical so an AFK
 * `run` never blocks.
 */
async function selectIssue(context: SelectorContext): Promise<string | undefined> {
  const repoRoot = process.cwd();

  if (!process.stdin.isTTY) {
    process.stderr.write(
      `error: no issue specified and no interactive terminal to select one.\n` +
        `Pass the issue name explicitly: diablo ${context} <issue>\n`,
    );
    return undefined;
  }

  const config = await loadConfig({ fs: new NodeFs() }, `${repoRoot}/${CONFIG_FILENAME}`);
  const names = discoverIssues(repoRoot);
  if (names.length === 0) {
    process.stderr.write(`error: no issues found under .scratch/. Run \`diablo intake <feature>\` first.\n`);
    return undefined;
  }

  const runner = new NodeProcessRunner();
  const rows = await enrichIssues(
    { fs: new NodeFs(), git: new GitCli(repoRoot, runner) },
    {
      issues: names,
      diabloDir: diabloDirFor(repoRoot),
      targetBranch: config.integration.targetBranch,
      branchPrefix: config.integration.branchPrefix,
    },
  );

  const display = listFor(context, rows);
  if (display.length === 0) {
    process.stdout.write(`No issues available to ${context}.\n`);
    return undefined;
  }

  const options = display.map((row) => {
    const badge = `${row.badge.symbol} ${row.badge.label}`;
    return row.hint ? `${row.issue}  [${badge}] (${row.hint})` : `${row.issue}  [${badge}]`;
  });

  const choice = await new StdinPrompt().select(`Select an issue to ${context}:`, options);
  const idx = options.indexOf(choice);
  return display[idx]?.issue ?? display[0]!.issue;
}

/**
 * Runs the `diablo plan` negotiation gate: the planner proposes a staged plan,
 * the human challenges it, and on an explicit `approve` the plan is frozen and
 * the issue status becomes `planned`. Foreground and interactive — this is NOT
 * the AFK `run`. Before proposing, warns (does not block) if a prior issue is
 * done-but-unmerged into the target branch, since this plan may not see that
 * work.
 */
async function executePlan(
  target: string,
  flags: { plannerModel?: string; workerModel?: string; verifierModel?: string },
): Promise<number> {
  const repoRoot = process.cwd();
  const config = await loadConfig({ fs: new NodeFs() }, `${repoRoot}/${CONFIG_FILENAME}`);
  const models = resolveModels(config, flags);
  const overrides = buildOverrides(models);
  const skillsDir = config.skillsDir ?? SKILLS_DIR;
  const runId = newRunId();
  const worktree = `${repoRoot}/.worktrees/${target}`;
  const planPath = `${worktree}/.plans/${target}-plan.md`;
  const fs = new NodeFs();
  const runner = new NodeProcessRunner();
  const git = new GitCli(repoRoot, runner);

  // Warn (never block) on done-but-unmerged prior work.
  await warnUnmergedPriorWork(target, repoRoot, config, fs, git);

  // The plan is written inside the issue's worktree; create it if absent
  // (resume-aware, same as a run).
  if (!(await fs.exists(worktree))) {
    const branch = `${config.integration.branchPrefix}${target}`;
    await git.worktreeAdd(target, config.integration.targetBranch, branch);
  }

  const agent = new PiAgent(resolvePiBinary(process.env), runner, overrides, runId);

  process.stdout.write(`\nNegotiating a plan for ${target}. Propose → challenge → approve.\n\n`);

  const outcome = await negotiatePlan(
    {
      agent,
      fs,
      prompt: new StdinPrompt(),
      print: (line: string) => process.stdout.write(`${line}\n`),
    },
    {
      issue: target,
      worktree,
      planPath,
      ticketPaths: resolveTicketPaths(`${repoRoot}/.scratch/${target}`),
      plannerSkills: [skillFile(skillsDir, "master-plan")],
      runId,
      diabloDir: diabloDirFor(repoRoot),
    },
  );

  if (outcome === "frozen") {
    process.stdout.write(`\n✅ plan for ${target} frozen. Next: diablo run ${target}\n`);
  } else {
    process.stdout.write(`\n⏸  plan for ${target} aborted (not frozen). Nothing was committed.\n`);
  }
  return 0;
}

/**
 * Shared run executor for `run` and `refactor`. The two differ ONLY in the
 * planner flow injected (master-plan vs improve-codebase-architecture) and the
 * noun used in output — everything downstream (design, worker, verifier, final
 * verify, integration) is identical. This is issue 08's core: refactor is just
 * `run` with the planner skill swapped.
 */
async function executeRun(
  target: string,
  flags: { plannerModel?: string; workerModel?: string; verifierModel?: string },
  flow: PlannerFlow,
  noun: string,
): Promise<number> {
  const repoRoot = process.cwd();
  const config = await loadConfig({ fs: new NodeFs() }, `${repoRoot}/${CONFIG_FILENAME}`);
  const models = resolveModels(config, flags);
  const overrides = buildOverrides(models);
  const skillsDir = config.skillsDir ?? SKILLS_DIR;
  const runId = newRunId();
  const runConfig = buildRunConfig(
    repoRoot,
    target,
    skillsDir,
    config.retry,
    config.integration,
    config.gate,
    flow,
  );
  const fs = new NodeFs();
  const diabloDir = diabloDirFor(repoRoot);

  // Plan gate: a frozen plan (status "planned") runs; a draft plan (a plan file
  // exists but the issue was never approved) is REJECTED — this is where the
  // plan-negotiation gate gets its teeth. No plan file at all → auto-plan (the
  // full-AFK escape hatch, handled inside runDiablo/loadIssue).
  const rejected = await rejectIfDraftPlan(fs, diabloDir, target, runConfig.planPath);
  if (rejected) return 2;

  const progressPath = `${runConfig.worktree}/.plans/${target}-progress.md`;
  const progress = buildProgress(progressPath, target);
  const deps = buildDeps(repoRoot, overrides, runId, progress);

  await writeStatus({ fs }, { diabloDir, issue: target, status: "in-progress" });

  try {
    const result = await runDiablo(deps, runConfig);

    // Done gate: the run completed (so the final verification PASSED — runStep
    // throws on a failing verdict). Now map each acceptance criterion to the
    // verifier's evidence; the issue is "done" only if every criterion is
    // proven, else "needs-human". finalizeIssue persists the status.
    const decision = await finalizeIssue(
      { fs },
      {
        issuePath: firstTicketPath(repoRoot, target),
        diabloDir,
        issue: target,
        verdict: "pass",
        verifierText: finalVerifierText(result),
      },
    );

    if (decision.status === "done") {
      process.stdout.write(
        `\n✅ ${noun} ${target} complete` +
          (result.commit ? ` — final commit ${result.commit.slice(0, 10)}` : "") +
          ` — status: done\n`,
      );
    } else {
      process.stdout.write(
        `\n⚠️  ${noun} ${target} verified PASS but the done gate held — status: needs-human.\n` +
          `   ${decision.reason}\n` +
          decision.unmet.map((c) => `   - unmet: ${c}`).join("\n") +
          `\n`,
      );
    }
    writeIntegrationNotice(result.integration);
    return 0;
  } catch (err) {
    if (err instanceof GateDeclinedError) {
      // A human declined at an approval gate — a clean halt awaiting them.
      await writeStatus({ fs }, { diabloDir, issue: target, status: "needs-human" });
      process.stdout.write(`\n⏸  ${err.message} — status: needs-human\n`);
      return 0;
    }
    if (err instanceof VerificationFailedError) {
      await writeStatus({ fs }, { diabloDir, issue: target, status: "needs-human" });
      process.stdout.write(`\n⚠️  ${noun} ${target} halted at verification — status: needs-human.\n`);
      return 1;
    }
    throw err;
  }
}

/**
 * Returns true (and prints why) when a plan file exists but the issue has not
 * been approved to "planned" — i.e. a half-negotiated draft. `run` must not
 * execute a draft. When no plan exists, returns false so the run auto-plans.
 */
async function rejectIfDraftPlan(
  fs: NodeFs,
  diabloDir: string,
  issue: string,
  planPath: string,
): Promise<boolean> {
  if (!(await fs.exists(planPath))) return false; // no plan → auto-plan path
  const status = await readStatus({ fs }, { diabloDir, issue });
  if (status === "planned") return false; // frozen → proceed
  process.stderr.write(
    `error: ${issue} has a draft plan that was never approved (status: ${status}).\n` +
      `Approve it with \`diablo plan ${issue}\` (type 'approve' to freeze), or remove\n` +
      `the draft at ${planPath} to let \`run\` auto-plan.\n`,
  );
  return true;
}

/** The first ticket file for an issue — the acceptance-criteria source the done gate reads. */
function firstTicketPath(repoRoot: string, issue: string): string {
  const paths = resolveTicketPaths(`${repoRoot}/.scratch/${issue}`);
  return paths[0] ?? `${repoRoot}/.scratch/${issue}`;
}

/** The final verification step's text — the last step of the last stage. */
function finalVerifierText(result: RunDiabloResult): string {
  const lastStage = result.stages.at(-1);
  const lastStep = lastStage?.steps.at(-1);
  return lastStep?.text ?? "";
}

/**
 * Warns (never blocks) when a sibling issue is done but not yet merged into the
 * target branch: the plan about to be written may not see that committed work.
 * The human decides whether to proceed — consistent with the project's
 * warn-not-block posture (block only for genuinely dangerous actions).
 */
async function warnUnmergedPriorWork(
  current: string,
  repoRoot: string,
  config: DiabloConfig,
  fs: NodeFs,
  git: GitCli,
): Promise<void> {
  const others = discoverIssues(repoRoot).filter((name) => name !== current);
  const diabloDir = diabloDirFor(repoRoot);
  const unmerged: string[] = [];

  for (const issue of others) {
    const status = await readStatus({ fs }, { diabloDir, issue });
    if (status !== "done") continue;
    const branch = `${config.integration.branchPrefix}${issue}`;
    try {
      if (!(await git.isMerged(branch, config.integration.targetBranch))) {
        unmerged.push(issue);
      }
    } catch {
      // Branch absent / unknown ref — nothing to warn about.
    }
  }

  if (unmerged.length > 0) {
    process.stdout.write(
      `⚠️  These issues are done but not merged into ${config.integration.targetBranch}; ` +
        `this plan may not see their work:\n` +
        unmerged.map((i) => `   - ${i}`).join("\n") +
        `\n\n`,
    );
  }
}

/**
 * Runs the interactive setup-matt-pocock-skills flow. This is the ONE place
 * interactivity is appropriate (Socratic setup), so it runs an INTERACTIVE Pi
 * session (inherited stdio), not a headless `-p` run. The vendored skill is
 * injected as an @file reference.
 */
async function runSetupSkills(
  piBinary: string,
  runner: NodeProcessRunner,
  repoRoot: string,
): Promise<void> {
  process.stdout.write("\nSetting up engineering skills (interactive)...\n");
  const skill = skillFile(SKILLS_DIR, "setup-matt-pocock-skills");
  await runner.runInteractive(
    piBinary,
    [`@${skill}`, "Set up the engineering skills for this project following the skill."],
    repoRoot,
  );
}

/**
 * Initialises a git repo if the directory is not already one. Idempotent and
 * independent of the package-manager choice — every real bootstrap starts a
 * repo so husky's hooks (when installed) have somewhere to live.
 */
async function gitInit(runner: NodeProcessRunner, repoRoot: string): Promise<void> {
  if (existsSync(`${repoRoot}/.git`)) return;
  process.stdout.write("\nInitialising git repository...\n");
  await runner.run("git", ["init"], repoRoot);
}

/**
 * Returns true when the repo already has at least one commit. Used by init to
 * decide greenfield (no commits → seed common ignores) vs brownfield (the repo
 * owns its own conventions). `git rev-parse --verify HEAD` exits non-zero when
 * there is no HEAD (no commits, or not a repo at all), which both map to
 * "greenfield" — exactly the desired fresh-project semantics.
 */
async function hasCommits(runner: NodeProcessRunner, repoRoot: string): Promise<boolean> {
  const outcome = await runner.run("git", ["rev-parse", "--verify", "HEAD"], repoRoot);
  return outcome.exitCode === 0;
}

/**
 * Installs and initialises husky + commitlint using the chosen package manager,
 * then OVERWRITES husky's defaults with diablo's own hook artifacts. `husky init`
 * writes a `bun test`/`npm test` pre-commit that fails the first commit in a
 * test-less scaffold (stalling the AFK loop) and never wires commitlint; this
 * replaces the pre-commit with a no-test hook, adds the commit-msg commitlint
 * hook, and scaffolds commitlint.config.js. See domain/husky-hooks.ts.
 */
async function installTooling(
  runner: NodeProcessRunner,
  repoRoot: string,
  pm: PackageManager,
): Promise<void> {
  process.stdout.write(`\nBootstrapping husky/commitlint with ${pm}...\n`);
  const { install, huskyInit } = bootstrapCommands(pm);
  await runner.run(install.cmd, install.args, repoRoot);
  await runner.run(huskyInit.cmd, huskyInit.args, repoRoot);

  // Overwrite husky's test-running default and wire commitlint (which husky
  // init never does). Written AFTER init so .husky/ exists and our files win.
  const fs = new NodeFs();
  for (const artifact of huskyArtifacts(pm)) {
    await fs.write(`${repoRoot}/${artifact.path}`, artifact.content);
  }
}

/**
 * Runs the INTAKE phase: interactive grill-with-docs → to-prd → human PRD
 * approval → to-issues. Each step is an INTERACTIVE Pi session (inherited
 * stdio) because intake is Socratic and cannot be AFK — kept separate from the
 * autonomous `run`/`refactor` path. Greenfield vs brownfield is decided by the
 * intake use-case from the presence of CONTEXT.md.
 */
async function executeIntake(feature: string): Promise<number> {
  const repoRoot = process.cwd();
  const config = await loadConfig({ fs: new NodeFs() }, `${repoRoot}/${CONFIG_FILENAME}`);
  const skillsDir = config.skillsDir ?? SKILLS_DIR;
  const scratchDir = `${repoRoot}/.scratch/${feature}`;
  const runner = new NodeProcessRunner();
  const piBinary = resolvePiBinary(process.env);

  // All intake steps share ONE feature-scoped session so each resumes the prior
  // step's transcript instead of starting cold. Deliberately NOT runId-stamped:
  // a stable id means a re-run of `diablo intake <feature>` resumes the session,
  // matching the "re-run to continue" promise printed at the PRD gate.
  const sessionId = intakeSessionId(feature);

  const interactiveSkill = (skill: string, instruction: string, inputs: string[] = []) =>
    runner
      .runInteractive(
        piBinary,
        buildIntakeArgs({ sessionId, skillPath: skillFile(skillsDir, skill), instruction, inputs }),
        repoRoot,
      )
      .then(() => {});

  const result = await intakeDiablo(
    {
      fs: new NodeFs(),
      prompt: new StdinPrompt(),
      grill: (ctx: GrillContext) => {
        process.stdout.write(`\nGathering requirements for "${ctx.feature}" (${ctx.mode}, interactive)...\n`);
        return interactiveSkill(
          "grill-with-docs",
          `Gather requirements for the feature "${ctx.feature}" following the grill-with-docs skill. ` +
            `This is a ${ctx.mode} project: ${ctx.mode === "brownfield" ? "read the existing code and CONTEXT.md first" : "start from an empty glossary"}. ` +
            `Write the gathered requirements under ${ctx.scratchDir}.`,
        );
      },
      modelStateMachine: (ctx: GrillContext) => {
        process.stdout.write(`\nModeling the state machine (interactive)...\n`);
        return interactiveSkill(
          "domain-modeling",
          `Model the state machine for the feature "${ctx.feature}" following the domain-modeling skill: ` +
            `enumerate the states, transitions, guards, and events. ` +
            `Write the state machine as markdown to ${ctx.stateMachinePath} so the PRD step can incorporate it.`,
        );
      },
      toPrd: (ctx: GrillContext) => {
        process.stdout.write(`\nAuthoring the PRD (interactive)...\n`);
        return interactiveSkill(
          "to-prd",
          `Turn the gathered requirements for "${ctx.feature}" into a PRD following the to-prd skill. ` +
            (ctx.stateMachinePath
              ? `Incorporate the state machine modeled at ${ctx.stateMachinePath}. `
              : "") +
            `Write the PRD under ${ctx.scratchDir}.`,
          ctx.stateMachinePath ? [ctx.stateMachinePath] : [],
        );
      },
      toIssues: (ctx: GrillContext) => {
        process.stdout.write(`\nDecomposing the PRD into issues (interactive)...\n`);
        return interactiveSkill(
          "to-issues",
          `Decompose the approved PRD for "${ctx.feature}" into independently-grabbable issues following the ` +
            `to-issues skill. Write each issue as local markdown under ${ctx.scratchDir} in diablo's ticket format.`,
        );
      },
    },
    { feature, repoRoot, scratchDir },
  );

  if (result.decomposed) {
    process.stdout.write(
      `\n✅ intake of ${feature} complete — issues in ${scratchDir}\n` +
        `   Next: diablo run <issue>\n`,
    );
  } else {
    process.stdout.write(
      `\n⏸  intake of ${feature} stopped at the PRD (not approved). ` +
        `The PRD is in ${scratchDir}; re-run \`diablo intake ${feature}\` to continue.\n`,
    );
  }
  return 0;
}

/**
 * Prints what happened to the work branch after the run. autoMerge-off prints
 * the exact manual merge command; a clean auto-merge confirms integration; a
 * conflict lists the conflicting files and the manual command (never resolved).
 */
function writeIntegrationNotice(integration: RunDiabloResult["integration"]): void {
  if (!integration) return;
  switch (integration.status) {
    case "manual":
      process.stdout.write(
        `\n📦 work is on ${integration.branch}. To integrate:\n   ${integration.command}\n`,
      );
      return;
    case "merged":
      process.stdout.write(
        `\n📦 merged ${integration.branch} into ${integration.targetBranch}.\n`,
      );
      return;
    case "conflict":
      process.stdout.write(
        `\n⚠️  merge of ${integration.branch} into ${integration.targetBranch} hit conflicts ` +
          `(aborted cleanly, nothing auto-resolved):\n` +
          integration.conflicts.map((f) => `   - ${f}`).join("\n") +
          `\n\nResolve by hand:\n   ${integration.command}\n`,
      );
      return;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
