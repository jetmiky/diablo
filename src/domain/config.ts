/**
 * The diablo config domain: a minimal, optional configuration plus the
 * three-layer precedence rule that governs model selection.
 *
 *   built-in defaults  <-  diablo.config.json  <-  CLI flag
 *
 * Kept deliberately small (models, integration, gate, retry, skillsDir) — adding
 * knobs is resisted by design. Pure (no I/O): `parseConfig` turns JSON text into
 * a fully-defaulted config and `resolveModels` applies the precedence chain, so
 * both are unit-tested directly. The loader use-case wraps the filesystem read.
 *
 * Model resolution:
 *   Every role (planner, worker, verifier) resolves to a concrete {provider, model}
 *   pair. The resolution chain is:
 *
 *     default_provider / default_model          (top-level, REQUIRED)
 *       <- models.<role>.provider / .model      (per-role override, optional)
 *         <- CLI --<role>-model flag             (model only, wins over config)
 *
 *   The final Pi model string is: `{provider}/{model}:{tier}`
 *   where tier is "high"/"medium" (planner) or "medium" (worker/verifier).
 */
import type { GateMode } from "../ports/gate.ts";

/**
 * Per-role model override. Both fields are optional — omitted fields fall back
 * to the top-level `default_provider` / `default_model`.
 */
export interface RoleModelOverride {
  provider?: string;
  model?: string;
}

/** The `models` config field: per-role optional overrides. */
export interface ConfigModels {
  planner?: RoleModelOverride;
  worker?: RoleModelOverride;
  verifier?: RoleModelOverride;
}

/** Fully resolved per-role model (no optionals — all defaults applied). */
export interface ResolvedRoleModel {
  provider: string;
  model: string;
}

/** All three roles resolved to concrete provider+model pairs. */
export interface ResolvedModels {
  planner: ResolvedRoleModel;
  worker: ResolvedRoleModel;
  verifier: ResolvedRoleModel;
}

export interface ConfigIntegration {
  targetBranch: string;
  branchPrefix: string;
  autoMerge: boolean;
}

export interface ConfigRetry {
  /** Max worker re-attempts on an implementation FAIL before halting to a human. */
  limit: number;
}

/**
 * Safety ceilings for an unattended run. Generous by default — these exist to
 * stop a pathological hang or runaway, never to clip a legitimately long run.
 */
export interface ConfigLimits {
  /** Max wall-clock for a SINGLE agent step before it is killed (ms). */
  stepTimeoutMs: number;
  /** Max wall-clock for the WHOLE run before it aborts cleanly (ms). */
  runBudgetMs: number;
  /** Max number of agent steps in a run before it aborts (circuit breaker). */
  maxSteps: number;
}

/**
 * The deterministic verification gate diablo runs itself after a committing
 * step (ADR 0001). Each command is run in the worktree; a non-zero exit makes
 * the stage FAIL regardless of the verifier LLM's verdict. Empty by default —
 * a project with no commands runs LLM-verdict-only, and diablo says so loudly
 * rather than pretending the verdict is authoritative.
 */
export interface ConfigVerify {
  /** Shell gate commands (e.g. "bun run typecheck", "bun test"), run in order. */
  commands: string[];
}

export interface DiabloConfig {
  /** The default Pi provider name (e.g. "9router"). REQUIRED. */
  defaultProvider: string;
  /** The default model identifier (e.g. "kr/claude-sonnet-4.5", "mimo/mimo-v2.5-pro"). REQUIRED. */
  defaultModel: string;
  models: ConfigModels;
  integration: ConfigIntegration;
  gate: GateMode;
  retry: ConfigRetry;
  limits: ConfigLimits;
  verify: ConfigVerify;
  /** Optional override for the vendored skills directory; resolver decides when absent. */
  skillsDir?: string;
}

/** CLI model flags that win over config (the top precedence layer). */
export interface ModelFlags {
  plannerModel?: string;
  workerModel?: string;
  verifierModel?: string;
}

const VALID_GATES: readonly GateMode[] = ["none", "approval"];

/**
 * The built-in defaults — used by `diablo init` to scaffold a config file.
 * NOT used as fallbacks during parsing (default_provider and default_model
 * are REQUIRED in the config file when it exists).
 */
export function defaultConfig(): DiabloConfig {
  return {
    defaultProvider: "9router",
    defaultModel: "kr/claude-sonnet-4.5",
    models: {},
    integration: {
      targetBranch: "main",
      branchPrefix: "diablo/",
      autoMerge: false,
    },
    gate: "none",
    retry: { limit: 2 },
    limits: {
      stepTimeoutMs: 20 * 60 * 1000, // 20 min — a long but bounded single step
      runBudgetMs: 4 * 60 * 60 * 1000, // 4 h — a whole-run wall-clock ceiling
      maxSteps: 200, // step-count circuit breaker
    },
    verify: { commands: [] }, // no deterministic gate until the project configures one
  };
}

/**
 * Parses `diablo.config.json` text into a fully-defaulted config. Missing keys
 * fall back to the built-in defaults (config is sparse-by-design); a present
 * key overrides only that field. Throws on malformed JSON, a non-object root,
 * an invalid enum value, or missing required fields (default_provider,
 * default_model), so a typo fails loudly rather than silently reverting to a
 * default.
 */
export function parseConfig(text: string): DiabloConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Invalid diablo.config.json: not valid JSON (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid diablo config: the top level must be a JSON object.");
  }

  const obj = raw as Record<string, unknown>;
  const base = defaultConfig();

  // Required fields — throw if missing or wrong type
  const defaultProvider = str(obj.default_provider);
  if (defaultProvider === undefined) {
    throw new Error(
      "Invalid diablo config: 'default_provider' is required (e.g. \"9router\").",
    );
  }
  const defaultModel = str(obj.default_model);
  if (defaultModel === undefined) {
    throw new Error(
      "Invalid diablo config: 'default_model' is required (e.g. \"kr/claude-sonnet-4.5\").",
    );
  }

  const models = mergeModels(obj.models);
  const integration = mergeIntegration(base.integration, obj.integration);
  const retry = mergeRetry(base.retry, obj.retry);
  const limits = mergeLimits(base.limits, obj.limits);
  const verify = mergeVerify(base.verify, obj.verify);
  const gate = parseGate(obj.gate, base.gate);

  const config: DiabloConfig = {
    defaultProvider,
    defaultModel,
    models,
    integration,
    gate,
    retry,
    limits,
    verify,
  };
  if (typeof obj.skillsDir === "string") config.skillsDir = obj.skillsDir;
  return config;
}

/**
 * Resolves the effective provider+model for each role from the three-layer
 * precedence chain: defaults ← config per-role overrides ← CLI flags.
 *
 * CLI flags (`--planner-model` etc.) only override the MODEL name; the provider
 * always comes from config (top-level default or per-role override).
 */
export function resolveModels(config: DiabloConfig, flags: ModelFlags): ResolvedModels {
  return {
    planner: {
      provider: config.models.planner?.provider ?? config.defaultProvider,
      model: flags.plannerModel ?? config.models.planner?.model ?? config.defaultModel,
    },
    worker: {
      provider: config.models.worker?.provider ?? config.defaultProvider,
      model: flags.workerModel ?? config.models.worker?.model ?? config.defaultModel,
    },
    verifier: {
      provider: config.models.verifier?.provider ?? config.defaultProvider,
      model: flags.verifierModel ?? config.models.verifier?.model ?? config.defaultModel,
    },
  };
}

function mergeModels(raw: unknown): ConfigModels {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid diablo config: 'models' must be an object.");
  }
  const m = raw as Record<string, unknown>;
  const result: ConfigModels = {};

  for (const role of ["planner", "worker", "verifier"] as const) {
    const val = m[role];
    if (val === undefined) continue;
    if (typeof val === "string") {
      // Backward compat: "models": { "worker": "haiku" } → model only
      result[role] = { model: val };
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      const override: RoleModelOverride = {};
      if (obj.provider !== undefined) {
        if (typeof obj.provider !== "string") {
          throw new Error(`Invalid diablo config: 'models.${role}.provider' must be a string.`);
        }
        override.provider = obj.provider;
      }
      if (obj.model !== undefined) {
        if (typeof obj.model !== "string") {
          throw new Error(`Invalid diablo config: 'models.${role}.model' must be a string.`);
        }
        override.model = obj.model;
      }
      result[role] = override;
    } else {
      throw new Error(
        `Invalid diablo config: 'models.${role}' must be a string or an object with 'provider' and/or 'model'.`,
      );
    }
  }

  return result;
}

function mergeIntegration(base: ConfigIntegration, raw: unknown): ConfigIntegration {
  if (raw === undefined) return base;
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid diablo config: 'integration' must be an object.");
  }
  const i = raw as Record<string, unknown>;
  return {
    targetBranch: str(i.targetBranch) ?? base.targetBranch,
    branchPrefix: str(i.branchPrefix) ?? base.branchPrefix,
    autoMerge: typeof i.autoMerge === "boolean" ? i.autoMerge : base.autoMerge,
  };
}

function mergeRetry(base: ConfigRetry, raw: unknown): ConfigRetry {
  if (raw === undefined) return base;
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid diablo config: 'retry' must be an object.");
  }
  const r = raw as Record<string, unknown>;
  const limit = r.limit;
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0)) {
    throw new Error("Invalid diablo config: 'retry.limit' must be a non-negative integer.");
  }
  return { limit: typeof limit === "number" ? limit : base.limit };
}

function mergeLimits(base: ConfigLimits, raw: unknown): ConfigLimits {
  if (raw === undefined) return base;
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid diablo config: 'limits' must be an object.");
  }
  const l = raw as Record<string, unknown>;
  return {
    stepTimeoutMs: positiveInt(l.stepTimeoutMs, base.stepTimeoutMs, "limits.stepTimeoutMs"),
    runBudgetMs: positiveInt(l.runBudgetMs, base.runBudgetMs, "limits.runBudgetMs"),
    maxSteps: positiveInt(l.maxSteps, base.maxSteps, "limits.maxSteps"),
  };
}

/** A present value must be a positive integer; absent falls back to the default. */
function positiveInt(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid diablo config: '${name}' must be a positive integer.`);
  }
  return value;
}

function mergeVerify(base: ConfigVerify, raw: unknown): ConfigVerify {
  if (raw === undefined) return base;
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid diablo config: 'verify' must be an object.");
  }
  const v = raw as Record<string, unknown>;
  if (v.commands === undefined) return base;
  if (
    !Array.isArray(v.commands) ||
    v.commands.some((c) => typeof c !== "string")
  ) {
    throw new Error("Invalid diablo config: 'verify.commands' must be an array of strings.");
  }
  return { commands: v.commands as string[] };
}

function parseGate(raw: unknown, fallback: GateMode): GateMode {
  if (raw === undefined) return fallback;
  if (typeof raw !== "string" || !VALID_GATES.includes(raw as GateMode)) {
    throw new Error(
      `Invalid diablo config: 'gate' must be one of ${VALID_GATES.join(", ")} (got ${JSON.stringify(raw)}).`,
    );
  }
  return raw as GateMode;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
