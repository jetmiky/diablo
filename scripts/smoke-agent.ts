/**
 * Live smoke test for the AgentPort chain (PiAgent -> NodeProcessRunner ->
 * parsePiResult) against a REAL pi process with sonnet-4.5.
 *
 * Not part of `bun test` (costs tokens, needs network). Run manually:
 *   bun run scripts/smoke-agent.ts
 *
 * Proves: the built argv actually launches pi, runs in the given worktree,
 * and the JSONL stdout parses into a result with text + usage. A sentinel
 * reply confirms the @file injection + model selection round-tripped.
 */
import { PiAgent } from "../src/adapters/pi-agent.ts";
import { NodeProcessRunner } from "../src/adapters/node-process-runner.ts";
import { resolvePiBinary } from "../src/domain/pi-binary.ts";
import type { RunSpec } from "../src/domain/run-spec.ts";

const PI = resolvePiBinary(process.env);

const spec: RunSpec = {
  tier: "worker", // sonnet-4.5:medium
  issue: "smoke",
  stage: "stage-0",
  skills: [],
  inputs: [],
  instruction: "Reply with exactly the token: DIABLO_SMOKE_OK",
  worktree: process.cwd(),
};

console.log("Spawning real pi (worker tier = sonnet-4.5:medium)...");
const start = Date.now();
const agent = new PiAgent(PI, new NodeProcessRunner());

try {
  const result = await agent.run(spec);
  const ms = Date.now() - start;
  console.log("--- result ---");
  console.log("text:      ", JSON.stringify(result.text));
  console.log("stopReason:", result.stopReason);
  console.log("tokens:    ", result.usage.totalTokens);
  console.log("cost:      ", result.usage.cost);
  console.log("wall:      ", `${ms}ms`);
  const ok = result.text.includes("DIABLO_SMOKE_OK");
  console.log(ok ? "\n✅ SMOKE PASS — argv + spawn + parse all work end-to-end" : "\n❌ SMOKE FAIL — sentinel not found in reply");
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("\n❌ SMOKE ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
}
