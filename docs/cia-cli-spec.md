# CLI Spec: Chat-to-Structured Output Runner (Extended)

## Purpose
- Accepts a conversation history or template input.
- Executes an LLM task.
- Enforces JSON Schema on output when provided.
- Emits structured output with metadata.

## Command
- `cia run`

Note: `cia` alone is not a valid command for this spec.

## Usage
```
cia run \
  --input-file input.json \
  --schema-file schema.json \
  --output-file result.json \
  --provider azure \
  --model gpt-4.1 \
  --retries 2 \
  --log-level INFO
```

## Mode and Format Behavior

Rules:
- `--format=json` only changes the output envelope (plain vs JSON), not model behavior.
- `--mode=strict` requires a schema (`--schema-file` or `--schema-inline`).
- Lazy mode never enforces a schema.

Behavior matrix:

| Mode | Input | --format | LLM output | Envelope output |
|------|-------|----------|------------|-----------------|
| lazy | text  | default  | free-form  | plain text      |
| lazy | text  | json     | free-form  | JSON envelope   |
| lazy | json  | default  | free-form  | plain text      |
| lazy | json  | json     | free-form  | JSON envelope   |
| strict | text | default | schema-JSON | plain text (schema JSON only) |
| strict | text | json | schema-JSON | JSON envelope (schema JSON inside) |
| strict | json | default | schema-JSON | plain text (schema JSON only) |
| strict | json | json | schema-JSON | JSON envelope (schema JSON inside) |

## Mode Options
- `--mode` (`lazy|strict`, default: `lazy`)

Lazy mode examples:
```
echo "Multi-line
prompt" | cia run
```

```
cia run "Multi-Line
Prompt"
```

## Input Modes (mutually exclusive)
- `--input-file` (JSON conversation)

## Context Options
- `--context` (file, folder, or URL; can be provided multiple times)

## Provider Options
- `--provider` (`codex|claude|azure|openai|github-copilot`, default: `azure`)
- `--endpoint` (base URL)
- `--api-key` (token or key)
- `--model` (deployment or model ID)
- `--api-version` (optional; provider-specific)
- `--org` (optional; provider-specific)

Notes:
- Environment variables are the default configuration source; CLI flags override them.
- Supported SDKs: Codex SDK, Claude SDK, Vercel AI SDK (azure, github-copilot, openai)

## Configuration and Authentication

Configuration lookup order (JSON configuration is optional):
1. CLI flags (highest priority)
2. `.cia/config.json` in repo root
3. `~/.cia/config.json` in user home
4. Environment variables (fallback)

Environment variable fallbacks:
- `CODEX_API_KEY` - Codex SDK authentication
- `CLAUDE_API_KEY` - Claude SDK authentication  
- `AZURE_OPENAI_KEY` - Azure OpenAI key
- `AZURE_RESOURCE_NAME` - Azure resource name
- `OPENAI_API_KEY` - OpenAI API key
- `GITHUB_TOKEN` - GitHub Copilot authentication
- `CIA_DEFAULT_PROVIDER` - Default provider selection
- `CIA_DEFAULT_MODEL` - Default model selection

Authentication items are stored at `~/.local/share/cia/auth.json` with this shape:

```json
{
  "provider1": {
    "type": "oauth",
    "refresh": "...",
    "access": "...",
    "expires": 0
  }
}
```

Example config:

```json
{
  "model": "{env:DEFAULT_CIA_MODEL}",
  "provider": {
    "github-copilot": {},
    "anthropic": {},
    "azure": {},
    "openai": {
      "options": {
        "apiKey": "{env:OPENAI_API_KEY}",
        "reasoningEffort": "medium",
        "reasoningSummary": "auto",
        "textVerbosity": "medium",
        "include": [
          "reasoning.encrypted_content"
        ],
        "store": false
      },
      "models": {
        "gpt-5.2": {
          "name": "GPT 5.2 (OAuth)",
          "limit": {
            "context": 272000,
            "output": 128000
          },
          "modalities": {
            "input": [
              "text",
              "image"
            ],
            "output": [
              "text"
            ]
          },
          "variants": {
            "none": {
              "reasoningEffort": "none",
              "reasoningSummary": "auto",
              "textVerbosity": "medium"
            },
            "low": {
              "reasoningEffort": "low",
              "reasoningSummary": "auto",
              "textVerbosity": "medium"
            },
            "medium": {
              "reasoningEffort": "medium",
              "reasoningSummary": "auto",
              "textVerbosity": "medium"
            },
            "high": {
              "reasoningEffort": "high",
              "reasoningSummary": "detailed",
              "textVerbosity": "medium"
            },
            "xhigh": {
              "reasoningEffort": "xhigh",
              "reasoningSummary": "detailed",
              "textVerbosity": "medium"
            }
          }
        }
      }
    }
  }
}
```

## Schema Enforcement
- `--schema-file` (JSON Schema file)
- `--schema-inline` (JSON string; optional)
- When set, CLI uses `response_format: {"type": "json_schema", "json_schema": {...}}`
- If enforcement fails: retries then error exit
- Schema enforcement only applies in `--mode=strict`.

Implementation note:
- For strict, schema-first JSON output, reference the approach in `dev/ai-first-devops-toolkit` (pydantic-based validation and retry loop).

## Retry and Timeouts
- `--retries` (default: 1)
- `--retry-backoff` (exponential; default: true)
- `--timeout` (seconds; default: 60)

## Output
- `--format` (`default|json`, default: `default`)
- `--output-file` (default: `result.json`)
- `--output-format` (`json|yaml|md|text`, default: inferred from extension)

## Input JSON Format
```json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "context": {
    "session_id": "optional-id",
    "metadata": { "key": "value" }
  }
}
```

## Output JSON Format
```json
{
  "success": true,
  "response": { "...schema-compliant JSON..." },
  "metadata": {
    "runner": "cia",
    "timestamp": "ISO-8601"
  }
}
```

## Exit Codes
- `0` Success
- `1` Input validation error
- `2` Schema validation error
- `3` Authentication/config error
- `4` LLM execution error
- `5` Timeout

## Example: Context + Schema
```
cia run \
  --input-file conversation.json \
  --context src/utils.py \
  --schema-file review-schema.json \
  --provider azure \
  --model gpt-4o \
  --output-file review.json
```
