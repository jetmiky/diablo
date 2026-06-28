/**
 * Live smoke test for GitCli against REAL git in a throwaway repo.
 *
 * Not part of `bun test` (touches the filesystem + git). Run manually:
 *   bun run scripts/smoke-git.ts
 *
 * Proves: worktreeAdd actually creates an isolated worktree on diablo/<issue>,
 * commit returns a real 40-char SHA, headSha matches it, and diffStat reports
 * changes — the full durable-handoff primitive end-to-end.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitCli } from "../src/adapters/git-cli.ts";
import { BunProcessRunner } from "../src/adapters/bun-process-runner.ts";

const runner = new BunProcessRunner();
const repo = await mkdtemp(join(tmpdir(), "diablo-git-smoke-"));

async function git(args: string[], cwd: string) {
  const o = await runner.run("git", args, cwd);
  if (o.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${o.stderr}`);
  return o.stdout.trim();
}

try {
  // Set up a real repo with one commit on main.
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.email", "smoke@diablo.test"], repo);
  await git(["config", "user.name", "Diablo Smoke"], repo);
  await writeFile(join(repo, "README.md"), "# smoke\n");
  await git(["add", "-A"], repo);
  await git(["commit", "-q", "-m", "chore: init"], repo);

  const gitcli = new GitCli(repo, runner);

  // 1. worktreeAdd
  const wt = await gitcli.worktreeAdd("smoke-01", "main");
  console.log("worktreeAdd ->", wt);
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], wt);
  if (branch !== "diablo/smoke-01") throw new Error(`expected branch diablo/smoke-01, got ${branch}`);

  // 2. make a change + commit
  await writeFile(join(wt, "feature.ts"), "export const x = 1;\n");
  const sha = await gitcli.commit(wt, "feat: add feature x");
  console.log("commit ->", sha);
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`expected 40-char SHA, got ${sha}`);

  // 3. headSha matches the commit SHA
  const head = await gitcli.headSha(wt);
  console.log("headSha ->", head);
  if (head !== sha) throw new Error(`headSha ${head} != commit ${sha}`);

  // 4. diffStat reports the change against main
  const stat = await gitcli.diffStat(wt, "main");
  console.log("diffStat ->", JSON.stringify(stat));
  if (!stat.includes("feature.ts")) throw new Error("diffStat missing feature.ts");

  console.log("\n✅ SMOKE PASS — worktree, commit, headSha, diffStat all work against real git");
  process.exit(0);
} catch (err) {
  console.error("\n❌ SMOKE FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  // Best-effort cleanup: remove the worktree registration then the temp repo.
  try {
    await runner.run("git", ["worktree", "remove", "--force", join(repo, ".worktrees", "smoke-01")], repo);
  } catch {}
  await rm(repo, { recursive: true, force: true });
}
