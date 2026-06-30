/**
 * PLANNER_GUIDANCE is engine-owned prose appended to every planner instruction
 * (auto-plan in load-issue, interactive proposal in plan-session). It encodes
 * two plan-SHAPE constraints diablo's engine needs the master-plan output to
 * satisfy — kept HERE, in the engine, rather than by editing the vendored
 * master-plan skill, which stays a verbatim upstream copy. The skill says HOW
 * to plan; this says what shape diablo's pipeline requires of the result.
 *
 * 1. No zero-source stage (ADR 0004, issue #1 option C). diablo runs the
 *    typecheck/test gate after every stage. A stage that creates only
 *    directories or config — no compilable source file — leaves tsc with no
 *    inputs (TS18003). The gate now tolerates that empty state, but the cleaner
 *    shape is to avoid it: fold scaffolding into the first stage that also
 *    writes a real source file.
 *
 * 2. Criteria trace to the ticket (ADR 0005, issue #2 option C). The final
 *    whole-feature verification enforces EVERY task's acceptance criteria
 *    strictly. A criterion the planner invents but the ticket never asked for
 *    (e.g. "no type assertions") can fail idiomatic, typecheck-clean code at the
 *    last, least-recoverable gate. Task acceptance criteria must derive from the
 *    ticket's stated requirements, not the planner's stylistic preferences.
 */
export const PLANNER_GUIDANCE =
  `Two constraints diablo's pipeline places on the plan:\n` +
  `1. Do NOT emit a stage that produces no compilable source file (e.g. a stage ` +
  `that only creates directories or scaffolding). diablo runs the typecheck and ` +
  `test gate after EVERY stage, and an empty source tree has nothing to compile. ` +
  `Fold scaffolding into the first stage that also writes a real source file.\n` +
  `2. Every task's acceptance criteria MUST trace to a requirement stated in the ` +
  `ticket. Do NOT invent criteria the ticket never asked for (for example a ` +
  `stylistic rule like "no type assertions"): the final whole-feature ` +
  `verification enforces every criterion strictly, so a spurious one can fail ` +
  `correct, idiomatic, typecheck-clean code at the last gate.`;
