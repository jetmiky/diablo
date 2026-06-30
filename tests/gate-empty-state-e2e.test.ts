/**
 * Live, end-to-end check of the issue #1 fix using the REAL NodeProcessRunner
 * against actual empty-state worktrees — no fakes. Confirms the full path
 * (spawn tsc/bun → capture output → recognise nothing-to-check → combineVerdict)
 * behaves as designed against real tool output, and that a real failure still
 * fails.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeProcessRunner } from "../src/adapters/node-process-runner.ts";
import { CommandVerifyGate } from "../src/adapters/command-verify-gate.ts";
import { combineVerdict } from "../src/domain/measured-verdict.ts";

async function makeProject(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "diablo-gate-e2e-"));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content);
  }
  return dir;
}

const TSCONFIG = JSON.stringify({ compilerOptions: { noEmit: true, strict: true }, include: ["**/*.ts"] });

describe("issue #1 live gate behaviour (real NodeProcessRunner)", () => {
  test("empty source tree (tsc TS18003) → LLM pass survives as PASS", async () => {
    const dir = await makeProject({ "package.json": '{"name":"p"}', "tsconfig.json": TSCONFIG });
    try {
      const gate = new CommandVerifyGate(["bunx tsc --noEmit"], new NodeProcessRunner());
      const outcomes = await gate.run(dir);
      // Real tsc exited non-zero with TS18003 ...
      expect(outcomes[0]!.exitCode).not.toBe(0);
      expect(outcomes[0]!.output).toContain("TS18003");
      // ... but the gate treats the empty state as pass-equivalent.
      expect(combineVerdict("pass", "implementation", outcomes).verdict).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test("a REAL type error still FAILs (carve-out is scoped to the empty state)", async () => {
    const dir = await makeProject({
      "package.json": '{"name":"p"}',
      "tsconfig.json": TSCONFIG,
      "a.ts": "const n: number = 'not a number';\n",
    });
    try {
      const gate = new CommandVerifyGate(["bunx tsc --noEmit"], new NodeProcessRunner());
      const outcomes = await gate.run(dir);
      expect(outcomes[0]!.exitCode).not.toBe(0);
      const decision = combineVerdict("pass", "implementation", outcomes);
      expect(decision.verdict).toBe("fail");
      expect(decision.category).toBe("implementation");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  test("empty test suite (bun 'No tests found!') → LLM pass survives as PASS", async () => {
    const dir = await makeProject({ "package.json": '{"name":"p"}' });
    try {
      const gate = new CommandVerifyGate(["bun test"], new NodeProcessRunner());
      const outcomes = await gate.run(dir);
      expect(outcomes[0]!.exitCode).not.toBe(0);
      expect(outcomes[0]!.output.toLowerCase()).toContain("no tests found");
      expect(combineVerdict("pass", "implementation", outcomes).verdict).toBe("pass");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
