# ADR 0003 — Per-stage verification tier (cross-tier review)

Status: accepted
Date: 2026-06-29

## Context

In the default tier mapping the worker and the **per-stage** verifier are the
same model class (sonnet-4.5). Only the FINAL whole-feature verification rises to
the planner tier (opus). So every per-stage verdict — the load-bearing ones that
gate retry and stage progression — is same-class self-review, which has a known
blind spot: a verifier of the same capability as the author shares its failure
modes and tends to ratify them.

Three options were considered:

- **Leave entirely as-is** — no change, no guidance.
- **Bump the default** — make the per-stage verifier one tier above the worker
  (e.g. worker sonnet, verifier opus). Stronger review.
- **Document-only** — keep the cheap default; document that the verifier can
  already be raised a tier via the existing `--verifier-model` flag / config, and
  recommend doing so when review strength matters more than cost.

## Decision

**Document-only. Keep the default per-stage verifier at the worker's tier.**

ADR 0001 (engine-owned verification) materially changed this tradeoff. The
deterministic gate — typecheck + tests — is now a **measured fact**: a green LLM
verdict cannot override a non-zero gate exit. The "did the tests actually pass"
question is no longer in the model's hands at all. What remains model-judged is
the softer "do the acceptance criteria hold / is this a plan vs implementation
defect" call — a much smaller surface.

## Rationale

The per-stage verifier is the **most frequent model call in a run** (every stage,
every retry). Bumping it to opus is the single most cost-multiplying change
available to the engine. With the hard gate now deterministic (ADR 0001), paying
that cost on every stage to harden only the *soft* criteria judgment is a poor
default trade. Keeping the cheap default while leaving the tier independently
configurable matches the project's standing posture: resist adding knobs and
cost to the default; let the human opt into stronger review when they want it.

Anyone who wants cross-tier review already has the mechanism — no new machinery
is warranted:

```bash
diablo run <issue> --verifier-model claude-opus-4.8
```

or persist it in `diablo.config.json` under `models.verifier`.

## Consequences

- No default tier mapping change; no code change. The existing
  `--verifier-model` / config override precedence (built-in ← config ← CLI flag)
  is unchanged and already covered by tests.
- README documents the recommendation to set the verifier a tier above the
  worker when review strength outweighs cost, with the mechanism shown.
- Revisit if real runs show the same-class per-stage verdict ratifying defects
  that the deterministic gate cannot catch.
