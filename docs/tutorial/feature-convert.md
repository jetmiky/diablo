# Feature 1 — currency conversion core

Status: ready-for-agent

A tiny, pure TypeScript library for currency conversion: parse and validate
inputs, apply a rate, and format the result as money. Small, deterministic, no
I/O — an ideal first run: clean TDD stages and unambiguous acceptance criteria.
This file IS a diablo run ticket; the [tutorial](README.md) runs it directly
with `diablo run` (no `plan` step). The live API fetch and interactive CLI that
sit on top of this core are deliberately deferred to
[`feature-cli.md`](feature-cli.md).

## What to build

A module `src/money.ts` exporting pure functions. No network, no prompts, no
files — every function takes its inputs as arguments and returns a value (or
throws):

- `type Currency = "USD" | "IDR" | "JPY" | "EUR"` — the only supported codes.
- `parseCurrency(input: string): Currency` — trims, uppercases, and returns a
  `Currency`. Throws for anything outside the four supported codes.
- `assertDifferentCurrencies(base: Currency, target: Currency): void` — throws
  when base and target are the same (you can't convert a currency to itself).
- `parseAmount(input: string): number` — accepts a numeric string, returns the
  number. Throws on non-numeric input (`"abc"`, `""`, `"12x"`) and on values
  that aren't finite and positive.
- `convert(amount: number, rate: number): number` — multiplies amount by rate.
  Pure arithmetic; the rate is supplied by the caller (Feature 2 fetches it).
- `formatMoney(amount: number, currency: Currency): string` — formats with
  thousands separators and the currency code, e.g. `IDR 15,000`,
  `USD 150.50`. Decimal places follow the currency: `IDR` and `JPY` are
  zero-decimal; `USD` and `EUR` use two decimals.

## Range and errors

- Only `USD`, `IDR`, `JPY`, `EUR` are valid currencies — everything else throws.
- `parseCurrency` is case-insensitive (`"usd"` → `"USD"`) and tolerant of
  surrounding whitespace.
- `parseAmount` rejects non-numeric, empty, non-finite (`NaN`, `Infinity`), and
  non-positive input. **Which** error type each function throws is up to the
  implementation, but invalid input must never silently produce a bogus number.

## Acceptance criteria

- [ ] `parseCurrency` accepts the four codes case-insensitively and rejects all others
- [ ] `assertDifferentCurrencies` throws when base equals target, passes otherwise
- [ ] `parseAmount` accepts valid numeric strings and rejects non-numeric / empty / non-positive input
- [ ] `convert` returns `amount * rate` for valid inputs
- [ ] `formatMoney` produces thousands separators and correct decimals per currency (`IDR 15,000`, `USD 150.50`)
- [ ] Tests written first (red → green), exercising the public interface only
- [ ] `bun run typecheck` clean and `bun test` passes

## Out of scope

- No network — rates are passed in as arguments (Feature 2 adds the live fetch).
- No CLI, prompts, or file I/O — a pure library only.
- No currencies beyond the four listed; no historical rates or rounding modes.
