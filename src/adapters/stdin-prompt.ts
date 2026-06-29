/**
 * StdinPrompt is the real PromptPort: it prints a question and reads the answer
 * from stdin. `confirm` treats anything not starting with "y" as a decline, so a
 * bare Enter is a safe default-no — matching StdinGate's posture. `select`
 * prints a numbered menu and reads a choice; a bare Enter (or any unrecognised
 * input) selects the first option, which callers pass as the safe default.
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

  async select(question: string, options: readonly string[]): Promise<string> {
    if (options.length === 0) throw new Error("select requires at least one option");
    const menu = options.map((opt, i) => `  ${i + 1}) ${opt}`).join("\n");
    process.stdout.write(`${question}\n${menu}\n[1-${options.length}, default 1] `);
    const raw = (await readLine()).trim();

    if (raw === "") return options[0]!;
    // Accept either the 1-based number or the option's literal text.
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1]!;
    const match = options.find((opt) => opt.toLowerCase() === raw.toLowerCase());
    return match ?? options[0]!;
  }

  async ask(question: string): Promise<string> {
    process.stdout.write(`${question} `);
    const answer = await readLine();
    return answer.trim();
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
