import { describe, expect, test } from "bun:test";
import {
  parseConfig,
  resolveModels,
  defaultConfig,
  type DiabloConfig,
} from "../src/domain/config.ts";
import { defaultModelName } from "../src/domain/run-spec.ts";

/**
 * The config layer is pure: parsing JSON text into a fully-defaulted config,
 * and resolving the three-layer precedence (built-in <- config <- CLI flag).
 * No filesystem here — the loader use-case sequences the read around these.
 */
describe("parseConfig", () => {
  test("applies built-in defaults when the config is an empty object", () => {
    const cfg = parseConfig("{}");
    expect(cfg.models.planner).toBe(defaultModelName("planner-high"));
    expect(cfg.models.worker).toBe(defaultModelName("worker"));
    expect(cfg.models.verifier).toBe(defaultModelName("verifier"));
    expect(cfg.integration.targetBranch).toBe("main");
    expect(cfg.integration.branchPrefix).toBe("diablo/");
    expect(cfg.integration.autoMerge).toBe(false);
    expect(cfg.gate).toBe("none");
    expect(cfg.retry.limit).toBe(2);
  });

  test("matches defaultConfig() for an empty object", () => {
    expect(parseConfig("{}")).toEqual(defaultConfig());
  });

  test("overrides only the keys present, keeping defaults for the rest", () => {
    const cfg = parseConfig('{ "models": { "worker": "claude-haiku-4.5" } }');
    expect(cfg.models.worker).toBe("claude-haiku-4.5");
    expect(cfg.models.planner).toBe(defaultModelName("planner-high")); // untouched
    expect(cfg.integration.autoMerge).toBe(false); // untouched
  });

  test("reads integration and gate overrides", () => {
    const cfg = parseConfig(
      '{ "integration": { "targetBranch": "develop", "autoMerge": true }, "gate": "none" }',
    );
    expect(cfg.integration.targetBranch).toBe("develop");
    expect(cfg.integration.autoMerge).toBe(true);
    expect(cfg.integration.branchPrefix).toBe("diablo/"); // default kept
    expect(cfg.gate).toBe("none");
  });

  test("reads the skills path override", () => {
    const cfg = parseConfig('{ "skillsDir": "/custom/skills" }');
    expect(cfg.skillsDir).toBe("/custom/skills");
  });

  test("leaves skillsDir undefined by default (resolver decides)", () => {
    expect(parseConfig("{}").skillsDir).toBeUndefined();
  });

  test("reads a retry limit override", () => {
    expect(parseConfig('{ "retry": { "limit": 5 } }').retry.limit).toBe(5);
  });

  test("defaults limits to generous values that won't false-trip a normal run", () => {
    const cfg = parseConfig("{}");
    // A long-but-bounded step ceiling and a whole-run ceiling. Defaults are
    // generous; they exist to stop a pathological hang/runaway, not normal runs.
    expect(cfg.limits.stepTimeoutMs).toBe(20 * 60 * 1000); // 20 min per step
    expect(cfg.limits.runBudgetMs).toBe(4 * 60 * 60 * 1000); // 4 h per run
    expect(cfg.limits.maxSteps).toBe(200); // step-count circuit breaker
  });

  test("reads limits overrides, keeping defaults for the rest", () => {
    const cfg = parseConfig('{ "limits": { "stepTimeoutMs": 60000 } }');
    expect(cfg.limits.stepTimeoutMs).toBe(60000);
    expect(cfg.limits.runBudgetMs).toBe(4 * 60 * 60 * 1000); // default kept
    expect(cfg.limits.maxSteps).toBe(200); // default kept
  });

  test("rejects a non-positive step timeout", () => {
    expect(() => parseConfig('{ "limits": { "stepTimeoutMs": 0 } }')).toThrow(/stepTimeoutMs/i);
    expect(() => parseConfig('{ "limits": { "stepTimeoutMs": -5 } }')).toThrow(/stepTimeoutMs/i);
  });

  test("rejects a non-positive run budget and a non-positive maxSteps", () => {
    expect(() => parseConfig('{ "limits": { "runBudgetMs": 0 } }')).toThrow(/runBudgetMs/i);
    expect(() => parseConfig('{ "limits": { "maxSteps": 0 } }')).toThrow(/maxSteps/i);
  });

  test("throws a clear error on malformed JSON", () => {
    expect(() => parseConfig("{ not json")).toThrow(/config.*json|parse|invalid/i);
  });

  test("rejects an unknown gate value", () => {
    expect(() => parseConfig('{ "gate": "bogus" }')).toThrow(/gate/i);
  });

  test("rejects a non-object top-level config", () => {
    expect(() => parseConfig("[]")).toThrow(/config/i);
    expect(() => parseConfig("42")).toThrow(/config/i);
  });
});

describe("resolveModels — built-in <- config <- CLI flag precedence", () => {
  const config: DiabloConfig = defaultConfig();

  test("with no config models set and no flags, uses built-in defaults", () => {
    const models = resolveModels(config, {});
    expect(models.planner).toBe(defaultModelName("planner-high"));
    expect(models.worker).toBe(defaultModelName("worker"));
    expect(models.verifier).toBe(defaultModelName("verifier"));
  });

  test("config model overrides the built-in default", () => {
    const cfg: DiabloConfig = {
      ...config,
      models: { planner: "opus-x", worker: "haiku-y", verifier: "sonnet-z" },
    };
    const models = resolveModels(cfg, {});
    expect(models.planner).toBe("opus-x");
    expect(models.worker).toBe("haiku-y");
    expect(models.verifier).toBe("sonnet-z");
  });

  test("a CLI flag wins over the config value", () => {
    const cfg: DiabloConfig = {
      ...config,
      models: { planner: "opus-x", worker: "haiku-y", verifier: "sonnet-z" },
    };
    const models = resolveModels(cfg, { plannerModel: "flag-planner" });
    expect(models.planner).toBe("flag-planner"); // flag wins
    expect(models.worker).toBe("haiku-y"); // config kept
  });

  test("a CLI flag wins even when config left the default", () => {
    const models = resolveModels(config, {
      workerModel: "claude-haiku-4.5",
      verifierModel: "claude-opus-4.8",
    });
    expect(models.worker).toBe("claude-haiku-4.5");
    expect(models.verifier).toBe("claude-opus-4.8");
    expect(models.planner).toBe(defaultModelName("planner-high"));
  });
});
