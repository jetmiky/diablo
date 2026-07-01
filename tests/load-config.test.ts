import { describe, expect, test } from "bun:test";
import { loadConfig, type LoadConfigDeps } from "../src/app/load-config.ts";
import { defaultConfig } from "../src/domain/config.ts";
import type { FsPort } from "../src/ports/fs.ts";

class FakeFs implements FsPort {
  files = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }
  read(path: string): Promise<string> {
    const v = this.files.get(path);
    if (v === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
    return Promise.resolve(v);
  }
  write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }
  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }
}

const PATH = "/proj/diablo.config.json";

function deps(fs: FsPort): LoadConfigDeps {
  return { fs };
}

describe("loadConfig", () => {
  test("returns built-in defaults when no config file exists (no regression)", async () => {
    const cfg = await loadConfig(deps(new FakeFs()), PATH);
    expect(cfg).toEqual(defaultConfig());
  });

  test("reads and parses an existing config file", async () => {
    const fs = new FakeFs({
      [PATH]: '{ "default_provider": "9router", "default_model": "mimo/mimo-v2.5-pro", "gate": "none", "models": { "worker": { "model": "haiku" } } }',
    });
    const cfg = await loadConfig(deps(fs), PATH);
    expect(cfg.gate).toBe("none");
    expect(cfg.defaultProvider).toBe("9router");
    expect(cfg.defaultModel).toBe("mimo/mimo-v2.5-pro");
    expect(cfg.models.worker).toEqual({ model: "haiku" });
  });

  test("propagates a clear error for a malformed config file", async () => {
    const fs = new FakeFs({ [PATH]: "{ not json" });
    await expect(loadConfig(deps(fs), PATH)).rejects.toThrow(/config.*json|json/i);
  });

  test("propagates the error when required fields are missing", async () => {
    const fs = new FakeFs({ [PATH]: '{ "gate": "none" }' });
    await expect(loadConfig(deps(fs), PATH)).rejects.toThrow(/default_provider/i);
  });
});
