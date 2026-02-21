# Legacy Environment Variable Migration

This guide migrates `cia` usage from legacy implicit environment defaults to explicit
configuration via `.cia/config.json` and CLI flags.

## What changed

Legacy configuration defaults are removed:

| Removed legacy input | Replacement |
| --- | --- |
| `CIA_PROVIDER` | `--provider` or `.cia/config.json` |
| `CIA_MODEL` | `--model` or `.cia/config.json` |
| `CIA_*` runtime defaults | CLI flags or `.cia/config.json` |
| provider fallback defaults via `AZURE_OPENAI_*`, `OPENAI_*`, `ANTHROPIC_*` | explicit provider options in `.cia/config.json` |

Enterprise transport variables are still supported:

| Variable | Purpose |
| --- | --- |
| `HTTP_PROXY` | HTTP proxy URL |
| `HTTPS_PROXY` | HTTPS proxy URL |
| `NO_PROXY` | Comma-separated proxy bypass hosts |
| `NODE_EXTRA_CA_CERTS` | Corporate CA bundle path |
| `NODE_USE_ENV_PROXY` | Enable Node env proxy usage (`1`/`0`, `true`/`false`) |

## Before and after

### Before (legacy, no longer supported)

```bash
export CIA_PROVIDER=codex
export CIA_MODEL=gpt-4
cia run "health-check"
```

### After (explicit config file)

```json
{
  "provider": "codex",
  "model": "gpt-4"
}
```

Save as `.cia/config.json`, then run:

```bash
cia run "health-check"
```

### After (explicit CLI flags)

```bash
cia run "health-check" --provider codex --model gpt-4
```

## Provider auth migration examples

Move provider keys into `.cia/config.json` and use `${VAR}` substitution:

```json
{
  "providers": {
    "openai": {
      "apiKey": "${OPENAI_API_KEY}"
    },
    "anthropic": {
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    "azure": {
      "apiKey": "${AZURE_OPENAI_API_KEY}",
      "baseUrl": "${AZURE_OPENAI_ENDPOINT}"
    }
  }
}
```

## Expected failure behavior

Legacy env-only invocations now fail loudly:

```bash
CIA_PROVIDER=codex CIA_MODEL=gpt-4 cia run "health-check"
```

Expected outcome: configuration validation fails and output includes explicit guidance to use
`--model` or `.cia/config.json`.

## Enterprise networking still works

```bash
HTTP_PROXY=http://proxy.internal:8080 \
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/corporate.pem \
cia run "health-check" --provider codex --model gpt-4
```
