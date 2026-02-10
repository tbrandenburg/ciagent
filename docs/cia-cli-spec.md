# CLI Spec: Chat-to-Structured Output Runner (Extended)

## Purpose
- Accepts a conversation history or template input.
- Executes an LLM task.
- Enforces JSON Schema on output when provided.
- Emits structured output with metadata.
- v1 returns a single response (non-streaming); streaming is deferred to v2+.

## Command
- `cia run`

Note: `cia` alone is not a valid command for this spec.

## Usage
```
cia run \
  --input-file input.json \
  --schema-file schema.json \
  --output-file result.json \
  --provider codex \
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
- `--provider` (`codex`, default: `codex`)
- `--endpoint` (base URL)
- `--api-key` (token or key)
- `--model` (optional model hint)
- `--api-version` (optional; provider-specific)
- `--org` (optional; provider-specific)

Notes:
- Environment variables are the default configuration source; CLI flags override them.
- Supported SDK: Codex SDK

## Configuration and Authentication

Configuration lookup order (JSON configuration is optional):
1. CLI flags (highest priority)
2. `.cia/config.json` in repo root
3. `~/.cia/config.json` in user home
4. Environment variables (fallback)

Environment variable fallbacks:
- `CIA_PROVIDER` - Provider selection (`codex`)
- `CIA_MODEL` - Model selection (optional)

Codex authentication is read from `~/.codex/auth.json` with this shape:

```json
{
  "tokens": {
    "id_token": "...",
    "access_token": "..."
  }
}
```

Example config:

```json
{
  "provider": "codex",
  "model": "gpt-5",
  "timeout": 60,
  "retries": 1
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
 - v1 outputs a complete response; chunked streaming output is out of scope.

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
  --provider codex \
  --output-file review.json
```

## JSON File Examples

### Example 1: Simple Chat (No Schema)

**input.json:**
```json
{
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant that provides concise and informative responses."
        },
        {
            "role": "user",
            "content": "Explain what CI/CD means in software development in one paragraph.",
            "name": "developer"
        }
    ]
}
```

**Usage:**
```bash
cia run --input-file input.json --mode lazy
```

**output.json (lazy mode):**
```json
{
  "success": true,
  "response": "CI/CD stands for Continuous Integration and Continuous Deployment...",
  "metadata": {
    "runner": "cia",
    "timestamp": "2026-02-09T08:00:00Z"
  }
}
```

### Example 2: Sentiment Analysis (With Schema)

**input.json:**
```json
{
    "messages": [
        {
            "role": "system",
            "content": "You are an expert sentiment analysis tool. Analyze the sentiment of the given text and provide structured analysis."
        },
        {
            "role": "user",
            "content": "Analyze the sentiment of this text: 'I absolutely love this new AI-first development approach! The productivity gains are incredible and the team is really excited about the possibilities. The only concern is the learning curve, but we're confident we can overcome it.'"
        }
    ]
}
```

**schema.json:**
```json
{
    "type": "object",
    "properties": {
        "sentiment": {
            "type": "string",
            "enum": ["positive", "negative", "neutral"],
            "description": "Overall sentiment of the content"
        },
        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Confidence score for the sentiment analysis (0-1)"
        },
        "key_points": {
            "type": "array",
            "items": {
                "type": "string"
            },
            "minItems": 1,
            "maxItems": 5,
            "description": "Main points or topics identified (1-5 items)"
        },
        "summary": {
            "type": "string",
            "maxLength": 200,
            "description": "Brief summary of the content (max 200 characters)"
        }
    },
    "required": ["sentiment", "confidence", "key_points", "summary"],
    "additionalProperties": false
}
```

**Usage:**
```bash
cia run \
  --input-file input.json \
  --schema-file schema.json \
  --mode strict \
  --output-file output.json
```

**output.json (strict mode):**
```json
{
  "success": true,
  "response": {
    "sentiment": "positive",
    "confidence": 0.85,
    "key_points": [
      "AI-first development approach",
      "Productivity gains",
      "Team excitement",
      "Learning curve concern"
    ],
    "summary": "The text expresses enthusiasm for AI-focused development, highlighting productivity improvements and team excitement, with a minor concern about the learning curve."
  },
  "metadata": {
    "runner": "cia",
    "timestamp": "2026-02-09T08:00:00Z"
  }
}
```

### Example 3: Code Review (With Context and Schema)

**input.json:**
```json
{
    "messages": [
        {
            "role": "system",
            "content": "You are a senior software engineer conducting code reviews. Focus on code quality, best practices, security, performance, and maintainability."
        },
        {
            "role": "user",
            "content": "Review this code for quality, security, and best practices:\n\n```python\nimport subprocess\nfrom flask import Flask, request, jsonify\n\napp = Flask(__name__)\n\n@app.route('/execute', methods=['POST'])\ndef execute_command():\n    command = request.json.get('command')\n    result = subprocess.run(command, shell=True, capture_output=True, text=True)\n    return jsonify({'stdout': result.stdout, 'stderr': result.stderr})\n\nif __name__ == '__main__':\n    app.run(debug=True, host='0.0.0.0')\n```"
        }
    ],
    "context": {
        "session_id": "code-review-security-001",
        "metadata": {
            "task_type": "code_review",
            "domain": "security",
            "language": "python",
            "framework": "flask"
        }
    }
}
```

**schema.json:**
```json
{
    "type": "object",
    "properties": {
        "overall_rating": {
            "type": "string",
            "enum": ["excellent", "good", "needs_work", "poor"],
            "description": "Overall assessment of the code quality"
        },
        "summary": {
            "type": "string",
            "description": "Brief summary of the code review findings"
        },
        "strengths": {
            "type": "array",
            "items": {
                "type": "string"
            },
            "description": "List of positive aspects found in the code"
        },
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["security", "performance", "maintainability", "style", "bug", "logic"],
                        "description": "Category of the issue"
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low"],
                        "description": "Severity level of the issue"
                    },
                    "description": {
                        "type": "string",
                        "description": "Description of the issue"
                    },
                    "line_number": {
                        "type": "integer",
                        "description": "Line number where the issue occurs (if applicable)"
                    },
                    "suggestion": {
                        "type": "string",
                        "description": "Suggested fix or improvement"
                    }
                },
                "required": ["category", "severity", "description", "suggestion"],
                "additionalProperties": false
            },
            "description": "List of issues found in the code"
        },
        "recommendations": {
            "type": "array",
            "items": {
                "type": "string"
            },
            "description": "General recommendations for improvement"
        },
        "test_coverage": {
            "type": "object",
            "properties": {
                "has_tests": {
                    "type": "boolean",
                    "description": "Whether tests are present"
                },
                "adequacy": {
                    "type": "string",
                    "enum": ["excellent", "good", "adequate", "insufficient", "missing"],
                    "description": "Assessment of test coverage adequacy"
                },
                "suggestions": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Suggestions for improving test coverage"
                }
            },
            "required": ["has_tests", "adequacy"],
            "additionalProperties": false
        }
    },
    "required": ["overall_rating", "summary", "strengths", "issues", "recommendations", "test_coverage"],
    "additionalProperties": false
}
```

**Usage:**
```bash
cia run \
  --input-file input.json \
  --schema-file schema.json \
  --mode strict \
  --output-file output.json
```

**output.json (strict mode):**
```json
{
  "success": true,
  "response": {
    "overall_rating": "poor",
    "summary": "This code has critical security vulnerabilities including command injection and lacks input validation.",
    "strengths": [
      "Uses Flask framework appropriately",
      "Captures both stdout and stderr"
    ],
    "issues": [
      {
        "category": "security",
        "severity": "critical",
        "description": "Command injection vulnerability via shell=True",
        "line_number": 10,
        "suggestion": "Use subprocess.run with a list of arguments instead of shell=True, or validate and sanitize input"
      },
      {
        "category": "security",
        "severity": "critical",
        "description": "No input validation on command parameter",
        "line_number": 9,
        "suggestion": "Implement whitelist validation for allowed commands"
      },
      {
        "category": "security",
        "severity": "high",
        "description": "Debug mode enabled in production",
        "line_number": 14,
        "suggestion": "Set debug=False for production deployments"
      }
    ],
    "recommendations": [
      "Add authentication and authorization",
      "Implement rate limiting",
      "Add comprehensive logging",
      "Use environment variables for configuration"
    ],
    "test_coverage": {
      "has_tests": false,
      "adequacy": "missing",
      "suggestions": [
        "Add unit tests for input validation",
        "Add security tests for injection attempts",
        "Add integration tests for API endpoints"
      ]
    }
  },
  "metadata": {
    "runner": "cia",
    "timestamp": "2026-02-09T08:00:00Z"
  }
}
```
