# Feature 2 — live converter CLI

Status: ready-for-agent

Builds on Feature 1: a runnable CLI that fetches live exchange rates and wraps
the pure `src/money.ts` core in an interactive loop, reusing `parseCurrency`,
`parseAmount`, `convert`, and `formatMoney` rather than reimplementing them.
This ticket leaves real design choices open (how network failure surfaces,
where the HTTP boundary lives, how the interactive loop stays testable) — which
is exactly why the [tutorial](README.md) runs it through `diablo plan` first, to
negotiate and freeze the approach before the build.

## What to build

A rate-fetching boundary plus an interactive CLI, both layered on Feature 1:

- `src/rates.ts` — `fetchRate(base: Currency, target: Currency): Promise<number>`
  calling the public API `https://open.er-api.com/v6/latest/{base}` and
  returning the `target` rate from the response `rates` map. No API key needed.
  - Success responses look like `{ "result": "success", "rates": { "IDR": 17885.01, ... } }`.
  - Error responses look like `{ "result": "error", "error-type": "..." }`.
- `src/cli.ts` — an interactive loop that:
  1. Asks for a **base** currency (USD, IDR, JPY, EUR only).
  2. Asks for a **target** currency, rejecting a target equal to the base.
  3. Asks for an **amount**, accepting numeric input only.
  4. Prints `Fetching API...` while the request is in flight.
  5. Prints the converted amount via `formatMoney` (`IDR 15,000`, `USD 150.50`).
  6. Prompts `[1] Convert Again  [2] Close Application` and loops or exits.

All parsing, validation, conversion, and formatting must reuse Feature 1 — this
ticket only adds the network boundary and the interactive shell.

## Design choices to settle during `diablo plan`

- **Network failure** — how a fetch failure, a non-`success` `result`, or a
  missing rate surfaces to the user without crashing the loop.
- **HTTP boundary** — how `fetchRate` is isolated so the CLI loop can be tested
  without real network calls (injecting the fetcher, a port/adapter seam, etc.).
- **Testable prompts** — how stdin/stdout are abstracted so the loop's flow can
  be exercised through its public interface rather than by typing live.

## Acceptance criteria

- [ ] `fetchRate` returns the correct target rate from a success response
- [ ] `fetchRate` failures (network error, error result, missing rate) are handled per the frozen plan, not left to crash
- [ ] The CLI loop reuses Feature 1 for all parsing/validation/conversion/formatting (not reimplemented)
- [ ] Invalid base/target/amount inputs are re-prompted, not fatal
- [ ] `Fetching API...` is shown while a request is in flight
- [ ] `[1] Convert Again` loops; `[2] Close Application` exits cleanly
- [ ] Tests written first (red → green), through the public interface only, with the network boundary stubbed
- [ ] `bun run typecheck` clean and `bun test` passes

## Out of scope

- No currencies beyond Feature 1's four; no historical rates or caching.
- No config files or persistence — the API needs no key.
