/**
 * A RunSpec describes a single Pi step the conductor dispatches: which model
 * tier runs it, which skills/inputs to inject, the instruction, and the
 * worktree to run in. `buildPiArgs` turns it into the exact `pi` argv.
 *
 * Pure (no I/O) so it is unit-tested directly. The adapter spawns the binary
 * with these args; this module owns the command shape and the isolation rules:
 *
 *  - skills + inputs are injected as `@file` references in the MESSAGE, never
 *    via `--skill` (which the 9router provider silently ignores in `-p`).
 *  - each step gets a deterministic `--session-id` (diablo-<issue>-<stage>-<role>)
 *    that is saved for later inspection but NEVER `--continue`d, so sessions
 *    stay isolated and the verifier never inherits a worker's reasoning.
 */

export type Tier = "planner-high" | "planner-med" | "worker" | "verifier";

export interface RunSpec {
  tier: Tier;
  issue: string;
  stage: string;
  skills: string[];
  inputs: string[];
  instruction: string;
  worktree: string;
  /**
   * A per-RUN identifier. Pi resumes an existing --session-id (creating it only
   * if missing), so a session-id identical across runs makes a new run resume
   * the previous transcript — the agent reads its own "already done" history and
   * does nothing. Embedding a runId keeps a session deterministic and shared
   * across one run's steps (still inspectable) but isolated from other runs.
   */
  runId?: string;
}

interface ModelSpec {
  model: string;
  thinking: "high" | "medium";
}

/**
 * Per-tier model overrides for a single run. A tier present here replaces its
 * default model+thinking; absent tiers keep the default. Used for cheap/toy
 * runs (e.g. planner on sonnet, worker on haiku) without editing the defaults.
 */
export type ModelOverrides = Partial<Record<Tier, ModelSpec>>;

const PROVIDER = "9router/kr";

const TIER_MODELS: Record<Tier, ModelSpec> = {
  "planner-high": { model: "claude-opus-4.8", thinking: "high" },
  "planner-med": { model: "claude-opus-4.8", thinking: "medium" },
  worker: { model: "claude-sonnet-4.5", thinking: "medium" },
  verifier: { model: "claude-sonnet-4.5", thinking: "medium" },
};

/** The role segment of the deterministic session id. */
const TIER_ROLES: Record<Tier, string> = {
  "planner-high": "planner",
  "planner-med": "planner",
  worker: "worker",
  verifier: "verifier",
};

export function modelFor(tier: Tier, overrides: ModelOverrides = {}): string {
  const spec = overrides[tier] ?? TIER_MODELS[tier];
  return `${PROVIDER}/${spec.model}:${spec.thinking}`;
}

/**
 * The built-in default model NAME for a tier (no provider/thinking suffix).
 * The single source of truth the config loader reads its model defaults from,
 * so config defaults and the run-spec tier table can never silently diverge.
 */
export function defaultModelName(tier: Tier): string {
  return TIER_MODELS[tier].model;
}

export function sessionIdFor(spec: RunSpec): string {
  const role = TIER_ROLES[spec.tier];
  const run = spec.runId ? `${spec.runId}-` : "";
  return `diablo-${spec.issue}-${run}${spec.stage}-${role}`;
}

/**
 * Builds the exact `pi` argv for a step. The returned array is passed straight
 * to the process spawner (no shell), so values need no quoting here. Optional
 * per-tier model overrides replace the default model for matching tiers.
 */
export function buildPiArgs(spec: RunSpec, overrides: ModelOverrides = {}): string[] {
  const args = [
    "-p",
    "--mode",
    "json",
    "--model",
    modelFor(spec.tier, overrides),
    "--session-id",
    sessionIdFor(spec),
  ];

  for (const skill of spec.skills) args.push(`@${skill}`);
  for (const input of spec.inputs) args.push(`@${input}`);

  args.push(spec.instruction);
  return args;
}
