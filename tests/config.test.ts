import { describe, expect, test } from "bun:test";
import {
  parseConfig,
  resolveModels,
  defaultConfig,
  type DiabloConfig,
  type ThinkingLevel,
} from "../src/domain/config.ts";

/**
 * The config layer is pure: parsing JSON text into a fully-defaulted config,
 * and resolving the three-layer precedence (built-in <- config <- CLI flag).
 * No filesystem here — the loader use-case sequences the read around these.
 */
describe("parseConfig", () => {
  const MINIMAL = '{ "default_provider": "9router", "default_model": "kr/claude-sonnet-4.5" }';

  test("requires default_provider", () => {
    expect(() => parseConfig("{}")).toThrow(/default_provider/i);
    expect(() => parseConfig('{ "default_model": "x" }')).toThrow(/default_provider/i);
  });

  test("requires default_model", () => {
    expect(() => parseConfig('{ "default_provider": "9router" }')).toThrow(/default_model/i);
  });

  test("applies built-in defaults for optional fields when only required fields are set", () => {
    const cfg = parseConfig(MINIMAL);
    expect(cfg.defaultProvider).toBe("9router");
    expect(cfg.defaultModel).toBe("kr/claude-sonnet-4.5");
    expect(cfg.models).toEqual({});
    expect(cfg.integration.targetBranch).toBe("main");
    expect(cfg.integration.branchPrefix).toBe("diablo/");
    expect(cfg.integration.autoMerge).toBe(false);
    expect(cfg.gate).toBe("none");
    expect(cfg.retry.limit).toBe(2);
  });

  test("overrides only the keys present, keeping defaults for the rest", () => {
    const cfg = parseConfig(`{
      "default_provider": "anthropic",
      "default_model": "claude-sonnet-4-20250514",
      "models": { "worker": { "model": "claude-haiku-4.5" } }
    }`);
    expect(cfg.defaultProvider).toBe("anthropic");
    expect(cfg.defaultModel).toBe("claude-sonnet-4-20250514");
    expect(cfg.models.worker).toEqual({ model: "claude-haiku-4.5" });
    expect(cfg.models.planner).toBeUndefined();
    expect(cfg.integration.autoMerge).toBe(false); // untouched
  });

  test("reads integration and gate overrides", () => {
    const cfg = parseConfig(
      `{ "default_provider": "9router", "default_model": "m", "integration": { "targetBranch": "develop", "autoMerge": true }, "gate": "none" }`,
    );
    expect(cfg.integration.targetBranch).toBe("develop");
    expect(cfg.integration.autoMerge).toBe(true);
    expect(cfg.integration.branchPrefix).toBe("diablo/"); // default kept
    expect(cfg.gate).toBe("none");
  });

  test("reads the skills path override", () => {
    const cfg = parseConfig(`{ "default_provider": "p", "default_model": "m", "skillsDir": "/custom/skills" }`);
    expect(cfg.skillsDir).toBe("/custom/skills");
  });

  test("leaves skillsDir undefined by default (resolver decides)", () => {
    expect(parseConfig(MINIMAL).skillsDir).toBeUndefined();
  });

  test("reads a retry limit override", () => {
    expect(parseConfig(`{ "default_provider": "p", "default_model": "m", "retry": { "limit": 5 } }`).retry.limit).toBe(5);
  });

  test("defaults limits to generous values that won't false-trip a normal run", () => {
    const cfg = parseConfig(MINIMAL);
    expect(cfg.limits.stepTimeoutMs).toBe(20 * 60 * 1000);
    expect(cfg.limits.runBudgetMs).toBe(4 * 60 * 60 * 1000);
    expect(cfg.limits.maxSteps).toBe(200);
  });

  test("reads limits overrides, keeping defaults for the rest", () => {
    const cfg = parseConfig(`{ "default_provider": "p", "default_model": "m", "limits": { "stepTimeoutMs": 60000 } }`);
    expect(cfg.limits.stepTimeoutMs).toBe(60000);
    expect(cfg.limits.runBudgetMs).toBe(4 * 60 * 60 * 1000);
    expect(cfg.limits.maxSteps).toBe(200);
  });

  test("rejects a non-positive step timeout", () => {
    const base = '{ "default_provider": "p", "default_model": "m", ';
    expect(() => parseConfig(base + '"limits": { "stepTimeoutMs": 0 } }')).toThrow(/stepTimeoutMs/i);
    expect(() => parseConfig(base + '"limits": { "stepTimeoutMs": -5 } }')).toThrow(/stepTimeoutMs/i);
  });

  test("rejects a non-positive run budget and a non-positive maxSteps", () => {
    const base = '{ "default_provider": "p", "default_model": "m", ';
    expect(() => parseConfig(base + '"limits": { "runBudgetMs": 0 } }')).toThrow(/runBudgetMs/i);
    expect(() => parseConfig(base + '"limits": { "maxSteps": 0 } }')).toThrow(/maxSteps/i);
  });

  test("defaults verify.commands to empty (no deterministic gate until configured)", () => {
    expect(parseConfig(MINIMAL).verify.commands).toEqual([]);
  });

  test("reads verify.commands as a list of gate commands", () => {
    const cfg = parseConfig(`{ "default_provider": "p", "default_model": "m", "verify": { "commands": ["bun run typecheck", "bun test"] } }`);
    expect(cfg.verify.commands).toEqual(["bun run typecheck", "bun test"]);
  });

  test("rejects a non-array verify.commands", () => {
    expect(() => parseConfig(`{ "default_provider": "p", "default_model": "m", "verify": { "commands": "bun test" } }`)).toThrow(/verify\.commands/i);
  });

  test("rejects non-string entries in verify.commands", () => {
    expect(() => parseConfig(`{ "default_provider": "p", "default_model": "m", "verify": { "commands": ["bun test", 42] } }`)).toThrow(/verify\.commands/i);
  });

  test("throws a clear error on malformed JSON", () => {
    expect(() => parseConfig("{ not json")).toThrow(/config.*json|parse|invalid/i);
  });

  test("rejects an unknown gate value", () => {
    expect(() => parseConfig(`{ "default_provider": "p", "default_model": "m", "gate": "bogus" }`)).toThrow(/gate/i);
  });

  test("rejects a non-object top-level config", () => {
    expect(() => parseConfig("[]")).toThrow(/config/i);
    expect(() => parseConfig("42")).toThrow(/config/i);
  });

  describe("per-role model overrides", () => {
    test("accepts string shorthand (backward compat: model only)", () => {
      const cfg = parseConfig(`{
        "default_provider": "9router",
        "default_model": "kr/claude-sonnet-4.5",
        "models": { "worker": "haiku", "verifier": "opus" }
      }`);
      expect(cfg.models.worker).toEqual({ model: "haiku" });
      expect(cfg.models.verifier).toEqual({ model: "opus" });
      expect(cfg.models.planner).toBeUndefined();
    });

    test("accepts object form with provider and model", () => {
      const cfg = parseConfig(`{
        "default_provider": "9router",
        "default_model": "kr/claude-sonnet-4.5",
        "models": {
          "planner": { "provider": "openrouter", "model": "deepseek/r1" },
          "worker": { "model": "qwen/qwen3-235b" }
        }
      }`);
      expect(cfg.models.planner).toEqual({ provider: "openrouter", model: "deepseek/r1" });
      expect(cfg.models.worker).toEqual({ model: "qwen/qwen3-235b" });
      expect(cfg.models.verifier).toBeUndefined();
    });

    test("accepts empty object for a role (inherits all defaults)", () => {
      const cfg = parseConfig(`{
        "default_provider": "9router",
        "default_model": "kr/claude-sonnet-4.5",
        "models": { "verifier": {} }
      }`);
      expect(cfg.models.verifier).toEqual({});
    });

    test("rejects non-string provider in a role override", () => {
      expect(() => parseConfig(`{
        "default_provider": "p", "default_model": "m",
        "models": { "worker": { "provider": 42 } }
      }`)).toThrow(/models\.worker\.provider/i);
    });

    test("rejects non-string model in a role override", () => {
      expect(() => parseConfig(`{
        "default_provider": "p", "default_model": "m",
        "models": { "planner": { "model": true } }
      }`)).toThrow(/models\.planner\.model/i);
    });

    test("rejects invalid role entry type", () => {
      expect(() => parseConfig(`{
        "default_provider": "p", "default_model": "m",
        "models": { "worker": 42 }
      }`)).toThrow(/models\.worker/i);
    });
  });
});

describe("resolveModels — built-in <- config <- CLI flag precedence", () => {
  const MINIMAL_JSON = '{ "default_provider": "9router", "default_model": "kr/claude-sonnet-4.5" }';

  test("with no per-role overrides and no flags, uses defaults", () => {
    const config = parseConfig(MINIMAL_JSON);
    const models = resolveModels(config, {});
    expect(models.planner).toEqual({ provider: "9router", model: "kr/claude-sonnet-4.5", thinking: "medium" });
    expect(models.worker).toEqual({ provider: "9router", model: "kr/claude-sonnet-4.5", thinking: "medium" });
    expect(models.verifier).toEqual({ provider: "9router", model: "kr/claude-sonnet-4.5", thinking: "medium" });
  });

  test("per-role model override replaces the default model", () => {
    const config = parseConfig(`{
      "default_provider": "9router",
      "default_model": "kr/claude-sonnet-4.5",
      "models": {
        "planner": { "model": "kr/claude-opus-4.8" },
        "worker": { "model": "kr/claude-haiku-4.5" }
      }
    }`);
    const models = resolveModels(config, {});
    expect(models.planner).toEqual({ provider: "9router", model: "kr/claude-opus-4.8", thinking: "medium" });
    expect(models.worker).toEqual({ provider: "9router", model: "kr/claude-haiku-4.5", thinking: "medium" });
    expect(models.verifier).toEqual({ provider: "9router", model: "kr/claude-sonnet-4.5", thinking: "medium" }); // default
  });

  test("per-role provider override replaces the default provider", () => {
    const config = parseConfig(`{
      "default_provider": "9router",
      "default_model": "kr/claude-sonnet-4.5",
      "models": {
        "planner": { "provider": "openrouter", "model": "deepseek/r1" }
      }
    }`);
    const models = resolveModels(config, {});
    expect(models.planner).toEqual({ provider: "openrouter", model: "deepseek/r1", thinking: "medium" });
    expect(models.worker).toEqual({ provider: "9router", model: "kr/claude-sonnet-4.5", thinking: "medium" }); // default
  });

  test("a CLI flag wins over the config model (but provider comes from config)", () => {
    const config = parseConfig(`{
      "default_provider": "9router",
      "default_model": "kr/claude-sonnet-4.5",
      "models": {
        "planner": { "provider": "openrouter", "model": "deepseek/r1" }
      }
    }`);
    const models = resolveModels(config, { plannerModel: "flag-model" });
    expect(models.planner).toEqual({ provider: "openrouter", model: "flag-model", thinking: "medium" }); // flag wins for model
    expect(models.worker).toEqual({ provider: "9router", model: "kr/claude-sonnet-4.5", thinking: "medium" });
  });

  test("a CLI flag wins even when config left the default", () => {
    const config = parseConfig(MINIMAL_JSON);
    const models = resolveModels(config, {
      workerModel: "claude-haiku-4.5",
      verifierModel: "claude-opus-4.8",
    });
    expect(models.worker).toEqual({ provider: "9router", model: "claude-haiku-4.5", thinking: "medium" });
    expect(models.verifier).toEqual({ provider: "9router", model: "claude-opus-4.8", thinking: "medium" });
    expect(models.planner).toEqual({ provider: "9router", model: "kr/claude-sonnet-4.5", thinking: "medium" });
  });

  test("each role can have a completely different provider", () => {
    const config = parseConfig(`{
      "default_provider": "9router",
      "default_model": "kr/claude-sonnet-4.5",
      "models": {
        "planner": { "provider": "anthropic", "model": "claude-opus-4-20250514" },
        "worker": { "provider": "9router", "model": "mimo/mimo-v2.5-pro" },
        "verifier": { "provider": "openrouter", "model": "deepseek/deepseek-chat-v3-0324" }
      }
    }`);
    const models = resolveModels(config, {});
    expect(models.planner).toEqual({ provider: "anthropic", model: "claude-opus-4-20250514", thinking: "medium" });
    expect(models.worker).toEqual({ provider: "9router", model: "mimo/mimo-v2.5-pro", thinking: "medium" });
    expect(models.verifier).toEqual({ provider: "openrouter", model: "deepseek/deepseek-chat-v3-0324", thinking: "medium" });
  });
});

describe("parseConfig — new defaults format", () => {
  const DEFAULTS_MINIMAL = '{ "defaults": { "provider": "9router", "model": "kr/claude-sonnet-4.5" } }';

  test("accepts the new defaults format with provider and model", () => {
    const cfg = parseConfig(DEFAULTS_MINIMAL);
    expect(cfg.defaultProvider).toBe("9router");
    expect(cfg.defaultModel).toBe("kr/claude-sonnet-4.5");
  });

  test("defaults.thinking is parsed and stored", () => {
    const cfg = parseConfig('{ "defaults": { "provider": "9router", "model": "m", "thinking": "high" } }');
    expect(cfg.defaultThinking).toBe("high");
  });

  test("defaults.thinking defaults to medium when omitted", () => {
    const cfg = parseConfig(DEFAULTS_MINIMAL);
    expect(cfg.defaultThinking).toBe("medium");
  });

  test("accepts all valid thinking levels", () => {
    const levels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
    for (const level of levels) {
      const cfg = parseConfig(`{ "defaults": { "provider": "p", "model": "m", "thinking": "${level}" } }`);
      expect(cfg.defaultThinking).toBe(level);
    }
  });

  test("rejects an invalid thinking level in defaults", () => {
    expect(() => parseConfig('{ "defaults": { "provider": "p", "model": "m", "thinking": "turbo" } }')).toThrow(
      /thinking/i,
    );
  });

  test("legacy format still works (backward compat)", () => {
    const cfg = parseConfig('{ "default_provider": "9router", "default_model": "kr/claude-sonnet-4.5" }');
    expect(cfg.defaultProvider).toBe("9router");
    expect(cfg.defaultModel).toBe("kr/claude-sonnet-4.5");
    expect(cfg.defaultThinking).toBe("medium"); // legacy gets the default
  });

  test("rejects when both defaults and default_provider are present", () => {
    expect(() =>
      parseConfig(
        '{ "defaults": { "provider": "p", "model": "m" }, "default_provider": "p", "default_model": "m" }',
      ),
    ).toThrow(/mutually exclusive/i);
  });
});

describe("parseConfig — per-role thinking override", () => {
  test("accepts thinking in a role override", () => {
    const cfg = parseConfig(`{
      "defaults": { "provider": "9router", "model": "kr/claude-sonnet-4.5" },
      "models": { "worker": { "thinking": "high" } }
    }`);
    expect(cfg.models.worker).toEqual({ thinking: "high" });
  });

  test("accepts thinking alongside provider and model in a role override", () => {
    const cfg = parseConfig(`{
      "defaults": { "provider": "9router", "model": "m" },
      "models": { "planner": { "provider": "openrouter", "model": "deepseek/r1", "thinking": "xhigh" } }
    }`);
    expect(cfg.models.planner).toEqual({ provider: "openrouter", model: "deepseek/r1", thinking: "xhigh" });
  });

  test("rejects an invalid thinking level in a role override", () => {
    expect(() =>
      parseConfig(`{
        "defaults": { "provider": "p", "model": "m" },
        "models": { "worker": { "thinking": "extreme" } }
      }`),
    ).toThrow(/models\.worker\.thinking/i);
  });

  test("string shorthand (backward compat) does not set thinking", () => {
    const cfg = parseConfig(`{
      "defaults": { "provider": "p", "model": "m" },
      "models": { "worker": "haiku" }
    }`);
    expect(cfg.models.worker).toEqual({ model: "haiku" });
  });
});

describe("resolveModels — thinking propagation", () => {
  test("resolved models carry the default thinking when no per-role override", () => {
    const config = parseConfig('{ "defaults": { "provider": "9router", "model": "m", "thinking": "high" } }');
    const models = resolveModels(config, {});
    expect(models.architect.thinking).toBe("high"); // per-role default for architect is "high", but config overrides it
    expect(models.planner.thinking).toBe("high");
    expect(models.worker.thinking).toBe("high");
    expect(models.verifier.thinking).toBe("high");
  });

  test("per-role thinking overrides the default", () => {
    const config = parseConfig(`{
      "defaults": { "provider": "9router", "model": "m", "thinking": "medium" },
      "models": { "worker": { "thinking": "high" } }
    }`);
    const models = resolveModels(config, {});
    expect(models.architect.thinking).toBe("high"); // architect built-in default
    expect(models.planner.thinking).toBe("medium"); // default
    expect(models.worker.thinking).toBe("high"); // overridden
    expect(models.verifier.thinking).toBe("medium"); // default
  });

  test("legacy config gives architect high thinking and others medium", () => {
    const config = parseConfig('{ "default_provider": "p", "default_model": "m" }');
    const models = resolveModels(config, {});
    expect(models.architect.thinking).toBe("high"); // architect built-in default
    expect(models.planner.thinking).toBe("medium");
    expect(models.worker.thinking).toBe("medium");
    expect(models.verifier.thinking).toBe("medium");
  });

  test("architect thinking can be overridden via config", () => {
    const config = parseConfig(`{
      "defaults": { "provider": "9router", "model": "m", "thinking": "medium" },
      "models": { "architect": { "thinking": "xhigh" } }
    }`);
    const models = resolveModels(config, {});
    expect(models.architect.thinking).toBe("xhigh");
  });
});
