/**
 * PromptPort is the interactive seam used during `diablo init` — the one place
 * interactivity is appropriate. The real adapter reads stdin (reusing the
 * StdinGate's default-no behaviour); tests use a fake returning canned answers.
 *
 * Kept separate from GatePort: a gate approves committed pipeline work, while a
 * prompt asks a setup question. Conflating them would couple init to the run
 * loop's request shape.
 */
export interface PromptPort {
  /** Returns true if the user accepted (y), false otherwise (default-no). */
  confirm(question: string): Promise<boolean>;
  /**
   * Presents a closed set of options and returns the chosen one. The real
   * adapter prints a numbered menu and reads a selection from stdin; the first
   * option is the default (a bare Enter selects it).
   */
  select(question: string, options: readonly string[]): Promise<string>;
  /**
   * Presents a free-text question and returns the raw trimmed line the user
   * typed. Used by plan negotiation, where the human's challenge is free text.
   */
  ask(question: string): Promise<string>;
}
