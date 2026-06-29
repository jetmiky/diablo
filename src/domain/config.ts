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
 */
import { defaultModelName } from "./run-spec.ts";
import type { GateMode } from "../ports/gate.ts";

export interface ConfigModels {
  /** The planner tier model NAME (provider/thinking are added at run time). */
  planner: string;
  worker: string;
  verifier: string;
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

export interface DiabloConfig {
  models: ConfigModels;
  integration: ConfigIntegration;
  gate: GateMode;
  retry: ConfigRetry;
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

/** The built-in defaults — the lowest precedence layer. */
export function defaultConfig(): DiabloConfig {
  return {
    models: {
      planner: defaultModelName("planner-high"),
      worker: defaultModelName("worker"),
      verifier: defaultModelName("verifier"),
    },
    integration: {
      targetBranch: "main",
      branchPrefix: "diablo/",
      autoMerge: false,
    },
    gate: "none",
    retry: { limit: 2 },
  };
}

/**
 * Parses `diablo.config.json` text into a fully-defaulted config. Missing keys
 * fall back to the built-in defaults (config is sparse-by-design); a present
 * key overrides only that field. Throws on malformed JSON, a non-object root,
 * or an invalid enum value, so a typo fails loudly rather than silently
 * reverting to a default.
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

  const models = mergeModels(base.models, obj.models);
  const integration = mergeIntegration(base.integration, obj.integration);
  const retry = mergeRetry(base.retry, obj.retry);
  const gate = parseGate(obj.gate, base.gate);

  const config: DiabloConfig = { models, integration, gate, retry };
  if (typeof obj.skillsDir === "string") config.skillsDir = obj.skillsDir;
  return config;
}

/**
 * Resolves the effective model NAMES from the precedence chain: a CLI flag (if
 * present) wins over the config value, which already carries the built-in
 * default for any key it did not set.
 */
export function resolveModels(config: DiabloConfig, flags: ModelFlags): ConfigModels {
  return {
    planner: flags.plannerModel ?? config.models.planner,
    worker: flags.workerModel ?? config.models.worker,
    verifier: flags.verifierModel ?? config.models.verifier,
  };
}

function mergeModels(base: ConfigModels, raw: unknown): ConfigModels {
  if (raw === undefined) return base;
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Invalid diablo config: 'models' must be an object.");
  }
  const m = raw as Record<string, unknown>;
  return {
    planner: str(m.planner) ?? base.planner,
    worker: str(m.worker) ?? base.worker,
    verifier: str(m.verifier) ?? base.verifier,
  };
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
