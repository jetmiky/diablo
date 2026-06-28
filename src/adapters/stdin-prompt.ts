/**
 * StdinPrompt is the real PromptPort: it prints a yes/no question and reads the
 * answer from stdin. Anything not starting with "y" (case-insensitive) is a
 * decline, so a bare Enter is a safe default-no — matching StdinGate's posture.
 *
 * Used only by `diablo init`; validated by the live init path, not unit tests
 * (the decision logic lives in init-diablo, tested against a fake prompt).
 */
import type { PromptPort } from "../ports/prompt.ts";

export class StdinPrompt implements PromptPort {
  async confirm(question: string): Promise<boolean> {
    process.stdout.write(`${question} [y/N] `);
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
