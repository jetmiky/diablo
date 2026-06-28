/**
 * StdinGate is the real GatePort: it prints what the human is approving (tier,
 * issue/stage, commit, and the agent's summary) and reads a y/N answer from
 * stdin. Anything not starting with "y" (case-insensitive) is a decline, so an
 * empty Enter is a safe default-no.
 *
 * Only used by the CLI; validated by the live smoke path, not unit tests (its
 * logic is a thin I/O wrapper — the decision behaviour lives in run-step).
 */
import type { GatePort, GateRequest } from "../ports/gate.ts";

export class StdinGate implements GatePort {
  async confirm(request: GateRequest): Promise<boolean> {
    const lines = [
      "",
      `━━━ approval gate ━━━`,
      `  step:   ${request.tier} (${request.issue}/${request.stage})`,
      request.commit ? `  commit: ${request.commit.slice(0, 10)}` : `  commit: (none)`,
      "",
      request.summary.trim(),
      "",
    ];
    process.stdout.write(lines.join("\n") + "\n");
    process.stdout.write("Proceed? [y/N] ");

    const answer = await readLine();
    return answer.trim().toLowerCase().startsWith("y");
  }
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      process.stdin.off("data", onData);
      process.stdin.pause();
      resolve(chunk.toString("utf8"));
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}
