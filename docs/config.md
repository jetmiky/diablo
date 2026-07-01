# `diablo.config.json`

`diablo.config.json` customizes how Diablo conducts Pi. The file is optional: if
it is absent, Diablo uses its built-in defaults. If the file is present, it must
be valid JSON and must include a model/provider default block.

> Note: this is strict JSON, not JSONC. Do not put comments in the real file.

## Minimal config

New projects scaffold the `defaults` format:

```json
{
  "defaults": {
    "provider": "9router",
    "model": "kr/claude-sonnet-4.5",
    "thinking": "medium"
  }
}
```

Everything except `defaults.provider` and `defaults.model` is optional.

Older configs using this legacy shape still work:

```json
{
  "default_provider": "9router",
  "default_model": "kr/claude-sonnet-4.5"
}
```

Do not mix `defaults` with `default_provider` / `default_model` in the same file.

## Full example

```json
{
  "defaults": {
    "provider": "9router",
    "model": "kr/claude-sonnet-4.5",
    "thinking": "medium"
  },
  "models": {
    "architect": {
      "model": "kr/claude-opus-4.8",
      "thinking": "high"
    },
    "planner": {
      "model": "kr/claude-opus-4.8"
    },
    "worker": {
      "model": "kr/claude-sonnet-4.5"
    },
    "verifier": {
      "model": "kr/claude-sonnet-4.5"
    }
  },
  "integration": {
    "targetBranch": "main",
    "branchPrefix": "diablo/",
    "autoMerge": false
  },
  "gate": "none",
  "retry": {
    "limit": 2
  },
  "verify": {
    "commands": ["bun run typecheck", "bun test"]
  },
  "limits": {
    "stepTimeoutMs": 1200000,
    "runBudgetMs": 14400000,
    "maxSteps": 200
  },
  "skillsDir": "/absolute/path/to/skills"
}
```

## Precedence

Configuration resolves in this order:

```text
built-in defaults <- diablo.config.json <- CLI flags
```

CLI model flags are run-local and do not edit the file:

```bash
diablo run currency-convert --worker-model kr/claude-haiku-4.5
diablo run currency-convert --verifier-model kr/claude-opus-4.8
```

CLI flags currently override model names for Planner, Worker, and Verifier. Use
`models.architect` in config to customize the Architect.

## `defaults`

```json
{
  "defaults": {
    "provider": "9router",
    "model": "kr/claude-sonnet-4.5",
    "thinking": "medium"
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `provider` | yes | Pi provider prefix, for example `9router`, `anthropic`, or `openrouter`. |
| `model` | yes | Provider-specific model id, for example `kr/claude-sonnet-4.5`. |
| `thinking` | no | Default Pi thinking level for Planner, Worker, and Verifier. Defaults to `medium`. |

Valid thinking levels:

```text
off, minimal, low, medium, high, xhigh
```

The Architect defaults to `high` thinking unless overridden under
`models.architect.thinking`.

## `models`

`models` customizes the four Pi actors independently.

```json
{
  "models": {
    "architect": { "model": "kr/claude-opus-4.8", "thinking": "high" },
    "planner": { "model": "kr/claude-opus-4.8" },
    "worker": { "model": "kr/claude-sonnet-4.5" },
    "verifier": { "model": "kr/claude-sonnet-4.5" }
  }
}
```

Each role can override any of:

| Field | Meaning |
| --- | --- |
| `provider` | Overrides `defaults.provider` for this actor only. |
| `model` | Overrides `defaults.model` for this actor only. |
| `thinking` | Overrides the actor's thinking level. |

String shorthand is also accepted for backward compatibility:

```json
{
  "models": {
    "worker": "kr/claude-haiku-4.5"
  }
}
```

That means “model only”; provider and thinking still come from defaults.

### Actor tuning examples

Use a stronger Architect and Planner for better plans:

```json
{
  "models": {
    "architect": { "model": "kr/claude-opus-4.8", "thinking": "high" },
    "planner": { "model": "kr/claude-opus-4.8", "thinking": "medium" }
  }
}
```

Use a stronger Verifier when review quality matters more than cost:

```json
{
  "models": {
    "verifier": { "model": "kr/claude-opus-4.8" }
  }
}
```

Use a cheaper Worker for scratch/toy runs:

```json
{
  "models": {
    "worker": { "model": "kr/claude-haiku-4.5" }
  }
}
```

## `integration`

Controls the branch Diablo creates and what happens after a passing run.

```json
{
  "integration": {
    "targetBranch": "main",
    "branchPrefix": "diablo/",
    "autoMerge": false
  }
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `targetBranch` | `main` | Branch the work branch is cut from and, if enabled, merged back into. |
| `branchPrefix` | `diablo/` | Prefix for generated branches, e.g. `diablo/currency-convert`. |
| `autoMerge` | `false` | When `true`, a final passing run attempts a clean merge into `targetBranch`. |

Conflicts are never auto-resolved. If `autoMerge` is false, Diablo prints the
manual merge command and leaves the branch for you.

## `gate`

Controls optional human checkpoints during `run` and `refactor`.

```json
{
  "gate": "none"
}
```

| Value | Meaning |
| --- | --- |
| `none` | Default. Run AFK after start; no per-stage prompt. |
| `approval` | Pause after each verified stage and ask whether to continue. |

This is separate from intake approval, plan approval, and final done-gate logic.

## `retry`

Controls implementation retries after verifier failures.

```json
{
  "retry": { "limit": 2 }
}
```

`limit` is the number of extra Worker attempts after the first implementation
failure.

| Value | Meaning |
| --- | --- |
| `0` | Fail fast after the first failed implementation attempt. |
| `2` | Default; allows two self-correction attempts. |
| Higher values | More autonomy, but more cost if the stage is structurally wrong. |

`VERDICT: FAIL [plan]` always halts immediately. Retries are only for
implementation failures.

## `verify`

Configures deterministic commands Diablo runs itself after verifying steps.

```json
{
  "verify": {
    "commands": ["bun run typecheck", "bun test"]
  }
}
```

A non-zero exit fails the stage even if the model says `VERDICT: PASS`. This is
what turns “tests pass” into a measured fact instead of a model claim.

If `commands` is empty, verification is LLM-verdict-only and Diablo warns at run
start.

Commands are split on whitespace. If you need shell features such as pipes,
redirects, environment variable expansion, or `&&`, put them in a script and call
that script from `verify.commands`.

Examples:

```json
{ "verify": { "commands": ["npm test"] } }
```

```json
{ "verify": { "commands": ["cargo test"] } }
```

```json
{ "verify": { "commands": ["./scripts/verify"] } }
```

## `limits`

Safety ceilings for unattended runs.

```json
{
  "limits": {
    "stepTimeoutMs": 1200000,
    "runBudgetMs": 14400000,
    "maxSteps": 200
  }
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `stepTimeoutMs` | `1200000` | 20 minutes. A single Pi step is aborted after this. |
| `runBudgetMs` | `14400000` | 4 hours. The whole run aborts after this. |
| `maxSteps` | `200` | Circuit breaker on total agent steps. |

Use lower values for tight CI-like runs; raise them for deliberately large work.

## `skillsDir`

Overrides Diablo's vendored skills directory.

```json
{
  "skillsDir": "/absolute/path/to/skills"
}
```

Most users should omit this. By default, Diablo uses the `skills/` directory
vendored into its own package. Override this only when testing a local skill fork
or debugging an engine/skill contract.

The `master-plan` skill output is parsed by Diablo. Pointing `skillsDir` at an
incompatible skill set can break plan loading.

## Telegram credentials are not config

Telegram progress uses:

```bash
diablo telegram setup
```

That writes credentials to gitignored `.diablo/telegram.json`. Environment
variables can override either field:

```bash
DIABLO_TELEGRAM_BOT_TOKEN=...
DIABLO_TELEGRAM_CHAT_ID=...
```

Credentials are intentionally not read from `diablo.config.json`.

## Validation behavior

Diablo fails loudly on malformed configuration:

- invalid JSON;
- non-object top-level value;
- missing required provider/model defaults;
- unknown `gate` value;
- invalid thinking level;
- invalid numeric limits;
- wrong types for nested fields.

A typo should not silently change how an unattended run behaves.
