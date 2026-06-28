/**
 * PromptPort is the interactive yes/no seam used during `diablo init` — the one
 * place interactivity is appropriate. The real adapter reads stdin (reusing the
 * StdinGate's default-no behaviour); tests use a fake returning a canned answer.
 *
 * Kept separate from GatePort: a gate approves committed pipeline work, while a
 * prompt asks a setup question. Conflating them would couple init to the run
 * loop's request shape.
 */
export interface PromptPort {
  /** Returns true if the user accepted (y), false otherwise (default-no). */
  confirm(question: string): Promise<boolean>;
}
