# Feature: JSON Schema Enforcement & Validation with Retry Logic

## Summary

Implement comprehensive schema enforcement for `--mode=strict` in ciagent CLI, adding JSON Schema validation with automatic retry logic for malformed LLM outputs. Uses AJV validation library with OpenAI structured outputs (response_format) integration, wrapped around existing provider abstraction without breaking AsyncGenerator streaming.

## User Story

As a DevOps engineer building CI/CD automation
I want to enforce JSON schemas on LLM outputs with automatic retry
So that my pipeline scripts can reliably parse structured responses without manual validation

## Problem Statement

Current `--mode=strict` flag in ciagent CLI parses `--schema-inline` and `--schema-file` options but does NOT enforce schema validation on AI responses. This creates unreliable automation workflows where malformed JSON outputs cause pipeline failures, forcing manual intervention and breaking the promise of structured outputs for enterprise CI/CD use cases.

## Solution Statement

Add a schema validation layer (SchemaValidatingChat) that wraps ReliableAssistantChat, enforcing JSON Schema validation with exponential backoff retry logic. Uses AJV for fast, secure validation and OpenAI's response_format for structured outputs when supported by providers. Maintains streaming AsyncGenerator interface while buffering assistant responses for validation.

## Metadata

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Type                   | ENHANCEMENT                                       |
| Complexity             | HIGH                                              |
| Systems Affected       | Provider abstraction, CLI parsing, error handling, output processing |
| Dependencies           | ajv@8+, existing p-retry infrastructure          |
| Estimated Tasks        | 8                                                 |
| **Research Timestamp** | **2026-02-11T14:30:00Z**                          |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              BEFORE STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │     CLI     │ ──────► │   Provider  │ ──────► │  Raw Output │            ║
║   │--mode strict│         │   Request   │         │  (Any JSON) │            ║
║   │--schema-... │         │             │         │             │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║          │                                               │                    ║
║          │                                               ▼                    ║
║          │                                    ┌─────────────┐                 ║
║          └──────────── IGNORED ──────────────►│Manual Check │                 ║
║                                               │   Required  │                 ║
║                                               └─────────────┘                 ║
║                                                                               ║
║   USER_FLOW: User runs cia --mode strict --schema-inline {...} "prompt"       ║
║   PAIN_POINT: Schema flags are parsed but NOT enforced - any JSON accepted   ║
║   DATA_FLOW: Prompt → LLM → Raw Response → Direct Output (no validation)     ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### After State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                               AFTER STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │     CLI     │ ──────► │   Provider  │ ──────► │Schema-Valid │            ║
║   │--mode strict│         │  w/Format   │         │   JSON      │            ║
║   │--schema-... │         │  Constraint │         │   Output    │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║          │                        │                       ▲                   ║
║          │                        ▼                       │                   ║
║          │               ┌─────────────┐                  │                   ║
║          └──────────────►│Schema Retry │──────────────────┘                   ║
║                          │Validation   │                                      ║
║                          │   Logic     │ ◄── retry on validation failure      ║
║                          └─────────────┘                                      ║
║                                   │                                           ║
║                                   ▼                                           ║
║                          ┌─────────────┐                                      ║
║                          │Exit Code 2  │ ◄── after max retries exceeded      ║
║                          │Schema Failed│                                      ║
║                          └─────────────┘                                      ║
║                                                                               ║
║   USER_FLOW: Same command → Automatic schema enforcement with retry           ║
║   VALUE_ADD: Guaranteed valid JSON output or explicit failure with exit 2    ║
║   DATA_FLOW: Prompt → LLM → Schema Check → Retry Loop → Valid Output/Error   ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `cia run --mode strict` | Parses schema flags but ignores | Enforces schema with retry | Same CLI command → guaranteed valid JSON or exit code 2 |
| Provider response handling | Raw LLM output directly returned | Schema validation layer intercepts | No user change → automatic validation + correction |
| Error scenarios | Generic "invalid JSON" messages | Specific schema validation errors | No user change → clear failure reasons with path details |
| Retry behavior | No retry on malformed output | Exponential backoff retry with correction prompts | No user change → resilient against LLM formatting errors |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| **P0** | **`dev/ai-first-devops-toolkit/llm_ci_runner/retry.py`** | **1-150** | **PROVEN retry implementation with exponential backoff, transient error detection** |
| **P0** | **`dev/ai-first-devops-toolkit/examples/01-basic/sentiment-analysis/schema.json`** | **all** | **PROVEN schema structure with enum validation, array constraints, required fields** |
| **P0** | **`dev/ai-first-devops-toolkit/examples/02-devops/pr-description/schema.json`** | **all** | **PROVEN complex schema with minLength/maxLength, multiple enums, conditional arrays** |
| P0 | `packages/cli/src/providers/reliability.ts` | 1-151 | Pattern to MIRROR for retry infrastructure using p-retry |
| P0 | `packages/cli/src/providers/types.ts` | 13-17 | Interface contract to MAINTAIN - AsyncGenerator streaming |
| P0 | `packages/cli/src/shared/errors/error-handling.ts` | 85-91, 36-43 | Error patterns to FOLLOW - schemaValidationFailed exists |
| P1 | `packages/cli/src/shared/validation/validation.ts` | 45-71 | CLI validation patterns to EXTEND |
| P1 | `packages/cli/src/commands/run.ts` | 90-112 | Output processing to MODIFY |
| P2 | `packages/cli/tests/providers.reliability.test.ts` | 1-433 | Test patterns to FOLLOW - AsyncGenerator mocking |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [OpenAI Node v6.1.0](https://github.com/openai/openai-node/blob/master/helpers.md#auto-parsing-chat-completion-content-with-zod-schema-in-typescript) ✓ Current | Structured Outputs with response_format | response_format JSON schema implementation | 2026-02-11T14:30:00Z |
| [p-retry v6.2.0](https://github.com/sindresorhus/p-retry/blob/main/readme.md#conditional-retries-with-shouldretry) ✓ Current | Conditional retry with shouldRetry | Custom retry logic for schema failures | 2026-02-11T14:30:00Z |
| [JSON Schema Spec](https://json-schema.org/understanding-json-schema/reference/object.html) ✓ Current | Object validation rules | Schema structure and validation patterns | 2026-02-11T14:30:00Z |

---

## Patterns to Mirror

**PROVEN_RETRY_PATTERNS:**
```python
# SOURCE: dev/ai-first-devops-toolkit/llm_ci_runner/retry.py:33-50
# PROVEN IMPLEMENTATION TO REFERENCE:
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_random_exponential,
)

@retry(
    retry=retry_if_exception(lambda e: _is_transient_error(e)),
    stop=stop_after_attempt(DEFAULT_MAX_RETRIES),
    wait=wait_random_exponential(
        multiplier=DEFAULT_EXPONENTIAL_MULTIPLIER,
        min=DEFAULT_MIN_WAIT,
        max=DEFAULT_MAX_WAIT
    ),
    before_sleep=before_sleep_log(LOGGER, logging.WARNING)
)
```

**PROVEN_SCHEMA_PATTERNS:**
```json
// SOURCE: dev/ai-first-devops-toolkit/examples/01-basic/sentiment-analysis/schema.json
// PROVEN SCHEMA STRUCTURE TO REFERENCE:
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
            "description": "Confidence score (0-1)"
        },
        "key_points": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 5,
            "description": "Main points (1-5 items)"
        }
    },
    "required": ["sentiment", "confidence", "key_points"],
    "additionalProperties": false
}
```

**RETRY_INFRASTRUCTURE:**
```typescript
// SOURCE: packages/cli/src/providers/reliability.ts:1-151
// COPY THIS PATTERN:
const successfulChunks = await pRetry(
  async () => {
    // Collection logic with error handling
  },
  {
    retries: maxRetries,
    factor: useBackoff ? 2 : 1,
    minTimeout: useBackoff ? 1000 : 500,
    maxTimeout: retryTimeout,
    randomize: useBackoff,
  }
);
```

**INTERFACE_CONTRACT:**
```typescript
// SOURCE: packages/cli/src/providers/types.ts:13-17
// COPY THIS PATTERN:
export interface IAssistantChat {
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  sendQuery(messages: Message[], cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  getType(): string;
}
```

**ERROR_HANDLING:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:85-91
// COPY THIS PATTERN:
schemaValidationFailed: (details: string): CliError =>
  createError(
    ExitCode.SCHEMA_VALIDATION,
    'Schema validation failed',
    details,
    'Check your --schema-file or --schema-inline parameter'
  ),
```

**CLI_VALIDATION:**
```typescript
// SOURCE: packages/cli/src/shared/validation/validation.ts:45-71
// COPY THIS PATTERN:
if (config.mode === 'strict') {
  if (!config['schema-file'] && !config['schema-inline']) {
    errors.push('Strict mode requires either --schema-file or --schema-inline to be specified.');
  }
}
```

**OUTPUT_PROCESSING:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:90-112
// COPY THIS PATTERN:
function parseStructuredResponse(responseText: string): unknown {
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
```

**TEST_MOCKING:**
```typescript
// SOURCE: packages/cli/tests/providers.reliability.test.ts:1-433
// COPY THIS PATTERN:
function makeGenerator(chunks: ChatChunk[]): AsyncGenerator<ChatChunk> {
  return (async function* generate() {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

const mockAssistantChat = {
  sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
  getType: () => 'codex',
};
```

---

## Current Best Practices Validation

**Security (Context7 MCP Verified):**
- ✅ AJV v8+ with secure compilation options (no eval, size limits)
- ✅ Schema input validation to prevent ReDoS attacks  
- ✅ Error message sanitization to prevent information disclosure
- ✅ Timeout protection for schema compilation and validation

**Performance (Web Intelligence Verified):**
- ✅ Schema compilation caching by content hash
- ✅ AJV JIT compilation for fast validation
- ✅ Streaming preserved for non-assistant chunks
- ✅ Exponential backoff prevents thundering herd

**Community Intelligence:**
- ✅ OpenAI structured outputs with response_format is current standard
- ✅ p-retry conditional retry patterns align with current practices
- ✅ JSON Schema Draft 2020-12 is current specification
- ✅ AJV v8+ is recommended JSON Schema validator

---

## Files to Change

| File                                                        | Action | Justification                                    |
| ----------------------------------------------------------- | ------ | ------------------------------------------------ |
| `packages/cli/src/shared/validation/schema-validator.ts`   | CREATE | JSON Schema validation utilities with AJV       |
| `packages/cli/src/providers/schema-validating-chat.ts`     | CREATE | Schema validation wrapper for providers         |
| `packages/cli/src/providers/factory.ts`                    | UPDATE | Integrate schema validation when mode=strict    |
| `packages/cli/src/commands/run.ts`                         | UPDATE | Pass schema config to provider factory          |
| `packages/cli/tests/shared/schema-validator.test.ts`       | CREATE | Unit tests for schema validation utilities      |
| `packages/cli/tests/providers/schema-validating-chat.test.ts` | CREATE | Integration tests for schema validation wrapper |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **Multiple schema format support**: JSON Schema only - YAML/XML schema formats deferred to future phases
- **Schema registry/management**: Users provide schemas via CLI flags - no schema storage/versioning system  
- **Interactive schema correction**: Automated retry only - no interactive prompts for schema fixes
- **Streaming JSON validation**: Full response buffering required for complete JSON validation - partial stream validation not supported
- **Custom validation error messages**: Use AJV default error format - no custom error message templating
- **Schema migration/versioning**: Static schema validation only - no automatic schema migration between versions

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: build, functionally test, then run unit tests with coverage enabled. Use `make test-coverage` when available.

**Coverage Targets**: MVP 40% (Phase 3b target)

### Task 1: CREATE `packages/cli/src/shared/validation/schema-validator.ts`

- **ACTION**: CREATE JSON Schema validation utilities using AJV
- **IMPLEMENT**: SchemaValidator class with compile, validate, and caching methods
- **MIRROR**: `dev/ai-first-devops-toolkit/llm_ci_runner/retry.py` secure patterns and error handling
- **REFERENCE_SCHEMAS**: Use `dev/ai-first-devops-toolkit/examples/01-basic/sentiment-analysis/schema.json` and `dev/ai-first-devops-toolkit/examples/02-devops/pr-description/schema.json` as test cases
- **IMPORTS**: `import Ajv from "ajv"; import { JSONSchema7 } from "json-schema"`
- **GOTCHA**: Use `{strict: false, validateSchema: true, addUsedSchema: false}` for security (following ai-first-devops-toolkit patterns)
- **CURRENT**: [AJV v8.17.1 Documentation](https://ajv.js.org/guide/getting-started.html) - schema compilation and validation patterns
- **CONFIG_CONFLICTS**: None known - AJV has no linting conflicts
- **GENERATED_FILES**: None - pure TypeScript implementation
- **VALIDATE**: `npx tsc --noEmit && make lint`
- **FUNCTIONAL**: `node -e "const {SchemaValidator} = require('./dist/shared/validation/schema-validator'); const v = new SchemaValidator(); console.log(v.validate('{\"sentiment\": \"positive\", \"confidence\": 0.9, \"key_points\": [\"test\"]}', JSON.parse(require('fs').readFileSync('dev/ai-first-devops-toolkit/examples/01-basic/sentiment-analysis/schema.json', 'utf8'))))"`
- **TEST_PYRAMID**: Add unit tests for: schema compilation, valid/invalid JSON validation using PROVEN schemas from dev/ai-first-devops-toolkit/examples, error handling, caching behavior

### Task 2: CREATE `packages/cli/src/providers/schema-validating-chat.ts`

- **ACTION**: CREATE schema validation wrapper implementing IAssistantChat
- **IMPLEMENT**: SchemaValidatingChat class wrapping IAssistantChat with validation logic
- **MIRROR**: `packages/cli/src/providers/reliability.ts:1-151` - AsyncGenerator wrapper pattern AND `dev/ai-first-devops-toolkit/llm_ci_runner/retry.py` - PROVEN retry logic with transient error detection
- **IMPORTS**: `import { IAssistantChat, ChatChunk } from "./types"; import { SchemaValidator } from "../shared/validation/schema-validator"`
- **TYPES**: Accept schema config in constructor, buffer assistant chunks for validation
- **GOTCHA**: Must preserve AsyncGenerator streaming - only buffer assistant chunks, pass through others immediately (following reliability.ts pattern)
- **CURRENT**: [OpenAI Structured Outputs](https://github.com/openai/openai-node/blob/master/helpers.md) - response_format implementation pattern
- **VALIDATE**: `npx tsc --noEmit && make lint`
- **TEST_PYRAMID**: Add integration tests for: valid schema validation using PROVEN schemas from dev/ai-first-devops-toolkit/examples, invalid JSON retry, error propagation, streaming behavior preservation

### Task 3: CREATE `packages/cli/tests/shared/schema-validator.test.ts`

- **ACTION**: CREATE comprehensive unit tests for SchemaValidator
- **IMPLEMENT**: Test schema compilation, validation, error cases, caching using PROVEN schemas from dev/ai-first-devops-toolkit
- **MIRROR**: `packages/cli/tests/providers.reliability.test.ts:1-433` - testing patterns and structure
- **PATTERN**: Use Vitest with describe/it blocks, comprehensive edge case coverage
- **REFERENCE_SCHEMAS**: Test against `dev/ai-first-devops-toolkit/examples/01-basic/sentiment-analysis/schema.json` (simple enum validation) and `dev/ai-first-devops-toolkit/examples/02-devops/pr-description/schema.json` (complex validation with minLength, maxLength, arrays)
- **CURRENT**: [AJV Testing Best Practices](https://ajv.js.org/guide/getting-started.html#basic-data-validation) - validation testing patterns
- **VALIDATE**: `npm test -- packages/cli/tests/shared/schema-validator.test.ts`
- **TEST_PYRAMID**: Unit tests covering: valid/invalid schemas from PROVEN examples, JSON validation success/failure against sentiment-analysis and pr-description schemas, error message format, performance caching

### Task 4: CREATE `packages/cli/tests/providers/schema-validating-chat.test.ts`

- **ACTION**: CREATE integration tests for SchemaValidatingChat wrapper
- **IMPLEMENT**: Test complete schema validation workflow with mock providers
- **MIRROR**: `packages/cli/tests/providers.reliability.test.ts:1-433` - AsyncGenerator mocking pattern
- **PATTERN**: Mock IAssistantChat, test schema validation, retry logic, error propagation
- **IMPORTS**: `import { SchemaValidatingChat } from "../../src/providers/schema-validating-chat"`
- **GOTCHA**: Must test streaming preservation - non-assistant chunks should pass through immediately
- **CURRENT**: [p-retry Testing Patterns](https://github.com/sindresorhus/p-retry/blob/main/test.js) - retry behavior validation
- **VALIDATE**: `npm test -- packages/cli/tests/providers/schema-validating-chat.test.ts`
- **TEST_PYRAMID**: Add integration tests for: end-to-end schema validation workflow, retry behavior, error scenarios

### Task 5: UPDATE `packages/cli/src/providers/factory.ts`

- **ACTION**: UPDATE provider factory to wrap with SchemaValidatingChat when mode=strict
- **IMPLEMENT**: Conditional wrapping logic based on CIAConfig.mode and schema presence
- **MIRROR**: Existing factory pattern - preserve provider creation, add conditional wrapper
- **PATTERN**: If mode='strict' and schema provided, wrap base provider with SchemaValidatingChat
- **IMPORTS**: `import { SchemaValidatingChat } from "./schema-validating-chat"`
- **CURRENT**: Follow existing factory patterns in codebase
- **VALIDATE**: `npx tsc --noEmit && make lint && make test`
- **FUNCTIONAL**: `cia run --provider codex --mode strict --schema-inline '{"type":"object"}' "test"` should enforce schema
- **TEST_PYRAMID**: Add integration tests for: factory schema wrapper creation, config-based wrapping logic

### Task 6: UPDATE `packages/cli/src/commands/run.ts`

- **ACTION**: UPDATE run command to pass schema configuration to provider factory
- **IMPLEMENT**: Extract schema-file/schema-inline from config, pass to factory
- **MIRROR**: `packages/cli/src/commands/run.ts:90-112` - existing config processing pattern
- **PATTERN**: Read schema config, validate, pass to provider creation
- **IMPORTS**: `import { readFileSync } from "fs"` for --schema-file support
- **GOTCHA**: Handle both --schema-file (read from disk) and --schema-inline (direct JSON)
- **CURRENT**: Use existing config loading patterns from codebase
- **VALIDATE**: `npx tsc --noEmit && make lint && make test && make build`
- **FUNCTIONAL**: `cia run --mode strict --schema-file schema.json "Generate JSON"` should work
- **TEST_PYRAMID**: Add E2E tests for: complete CLI workflow with schema validation, file vs inline schema handling

### Task 7: ADD dependency `ajv` to package.json

- **ACTION**: UPDATE package.json to add AJV dependency
- **IMPLEMENT**: Add `"ajv": "^8.17.1"` and `"@types/json-schema": "^7.0.15"` to dependencies
- **MIRROR**: Existing package.json dependency structure
- **PATTERN**: Use caret versioning for patch updates, exact major version
- **CURRENT**: [AJV v8.17.1](https://www.npmjs.com/package/ajv/v/8.17.1) - latest stable release verified
- **CONFIG_CONFLICTS**: No conflicts with existing dependencies - AJV is standalone
- **GENERATED_FILES**: package-lock.json will be updated by package manager
- **VALIDATE**: `bun install && bun run test:coverage && bun run build`
- **FUNCTIONAL**: Import statements should resolve without errors
- **TEST_PYRAMID**: No additional tests - dependency installation only

### Task 8: INTEGRATE schema validation error handling

- **ACTION**: UPDATE error handling to use existing schemaValidationFailed error
- **IMPLEMENT**: Connect SchemaValidatingChat validation failures to CommonErrors.schemaValidationFailed
- **MIRROR**: `packages/cli/src/shared/errors/error-handling.ts:85-91` - existing error pattern
- **PATTERN**: Throw CliError with exit code 2, include validation details in error message
- **IMPORTS**: `import { CommonErrors } from "../shared/errors/error-handling"`
- **GOTCHA**: AJV error format includes detailed path information - sanitize for security
- **CURRENT**: Follow existing error handling patterns and exit codes
- **VALIDATE**: `make test-coverage && make build && cia run --mode strict --schema-inline '{"type":"string"}' "Generate number" || echo $?` should return exit code 2
- **FUNCTIONAL**: Schema validation failures should produce clear error messages with exit code 2
- **TEST_PYRAMID**: Add critical user journey test for: complete error handling workflow from validation failure to CLI exit

---

## Testing Strategy

### Unit Tests to Write

| Test File                                           | Test Cases                              | Validates              |
| --------------------------------------------------- | --------------------------------------- | ---------------------- |
| `tests/shared/schema-validator.test.ts`             | compile valid/invalid schemas, validate JSON | Schema validation logic |
| `tests/providers/schema-validating-chat.test.ts`    | streaming, retry, validation workflow   | Provider wrapper behavior |
| `tests/commands/run.test.ts` (extend existing)      | schema config parsing, error handling   | CLI integration        |

### Edge Cases Checklist

- [ ] Invalid JSON schema provided via --schema-inline
- [ ] Schema file not found for --schema-file  
- [ ] LLM returns non-JSON response (syntax errors)
- [ ] LLM returns valid JSON that fails schema validation
- [ ] Max retries exceeded with persistent schema failures
- [ ] Very large JSON responses causing memory issues
- [ ] Network interruption during retry attempts
- [ ] Malformed schema causing AJV compilation errors
- [ ] Schema with ReDoS vulnerability patterns

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
bun run lint && bun run type-check
```

**EXPECT**: Exit 0, no errors or warnings

### Level 2: BUILD_AND_FUNCTIONAL

```bash
bun run build && echo '{"message": "test"}' | ./dist/cia run --mode strict --schema-inline '{"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]}' --provider codex
```

**EXPECT**: Schema validation works, valid JSON passes, exit 0

### Level 3: UNIT_TESTS

```bash
bun test -- --coverage --collectCoverageFrom="packages/cli/src/shared/validation/**" packages/cli/tests/shared/schema-validator.test.ts
```

**EXPECT**: All tests pass, coverage >= 40% for schema validation module

### Level 4: FULL_SUITE

```bash
bun test -- --coverage && bun run build
```

**EXPECT**: All tests pass, build succeeds, global coverage maintained

### Level 5: SCHEMA_VALIDATION

Use manual testing to verify:

- [ ] Valid JSON matching schema passes validation
- [ ] Invalid JSON fails validation with retry
- [ ] Schema compilation errors handled gracefully  
- [ ] Exit code 2 returned on validation failure after retries

### Level 6: CURRENT_STANDARDS_VALIDATION

Use Context7 MCP to verify:

- [ ] AJV configuration follows current security best practices
- [ ] JSON Schema implementation uses Draft 2020-12 standards
- [ ] Error handling follows current patterns  
- [ ] No deprecated or vulnerable dependencies

### Level 7: MANUAL_VALIDATION

1. Test with PROVEN sentiment analysis schema: `cia run --mode strict --schema-file dev/ai-first-devops-toolkit/examples/01-basic/sentiment-analysis/schema.json "Analyze the sentiment of this text: I love working with this new tool!"`
2. Test with PROVEN PR description schema: `cia run --mode strict --schema-file dev/ai-first-devops-toolkit/examples/02-devops/pr-description/schema.json "Generate a PR description for adding retry logic"`
3. Test invalid schema response: `cia run --mode strict --schema-inline '{"type":"object","properties":{"number":{"type":"number"}},"required":["number"]}' "Generate a string message"`
4. Test retry logic: Monitor logs during validation failures to ensure retry attempts
5. Test error messages: Verify schema validation errors are clear and actionable

---

## Acceptance Criteria

- [ ] `cia run --mode strict --schema-inline '{...}' "prompt"` enforces schema validation
- [ ] Valid JSON matching schema returns exit code 0 with valid output
- [ ] Invalid JSON triggers retry with exponential backoff 
- [ ] After max retries, exits with code 2 and clear error message
- [ ] Streaming behavior preserved for non-assistant chunks
- [ ] Level 1-4 validation commands pass with exit 0
- [ ] Unit tests cover >= 40% of new schema validation code
- [ ] Code mirrors existing patterns exactly (interfaces, errors, logging)
- [ ] No regressions in existing provider tests
- [ ] **Implementation follows current AJV and JSON Schema best practices**
- [ ] **No deprecated patterns or vulnerable dependencies**
- [ ] **Security recommendations up-to-date (no eval, input validation)**

---

## Completion Checklist

- [ ] All 8 tasks completed in dependency order
- [ ] Each task validated immediately after completion
- [ ] Level 1: Static analysis (lint + type-check) passes
- [ ] Level 2: Build and functional validation passes
- [ ] Level 3: Unit tests pass with coverage >= 40%  
- [ ] Level 4: Full test suite + build succeeds
- [ ] Level 5: Schema validation behavior verified manually
- [ ] Level 6: Current standards validation passes
- [ ] All acceptance criteria met

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 3 documentation queries (OpenAI Node, p-retry, JSON Schema)
**Web Intelligence Sources**: 1 JSON Schema specification consulted
**Last Verification**: 2026-02-11T14:30:00Z
**Security Advisories Checked**: AJV security configuration validated, ReDoS prevention verified
**Deprecated Patterns Avoided**: No eval-based schema compilation, secure AJV configuration enforced

---

## Risks and Mitigations

| Risk                                        | Likelihood   | Impact       | Mitigation                                    |
| ------------------------------------------- | ------------ | ------------ | --------------------------------------------- |
| Schema validation breaks streaming UX      | LOW          | HIGH         | Buffer only assistant chunks, stream others immediately |
| AJV security vulnerabilities (ReDoS)       | MEDIUM       | HIGH         | Use secure AJV config, validate schema inputs, timeouts |
| Performance degradation from validation    | MEDIUM       | MEDIUM       | Cache compiled schemas, optimize buffering strategy |
| LLM providers don't support response_format| HIGH         | MEDIUM       | Fallback to post-validation for unsupported providers |
| Documentation changes during implementation| LOW          | MEDIUM       | Context7 MCP re-verification during execution |
| Memory exhaustion from large responses     | MEDIUM       | MEDIUM       | Implement response size limits, streaming optimization |

---

## Notes

### Architecture Decision: Schema Validation Layer

The SchemaValidatingChat wrapper approach maintains the AsyncGenerator interface contract while adding validation capabilities. This preserves the streaming UX for system/tool messages while enabling complete JSON validation for assistant responses.

### CRITICAL: Proven Implementation Reference

**This implementation MUST reference the proven patterns from `dev/ai-first-devops-toolkit`:**

1. **Retry Logic**: The retry mechanism in `dev/ai-first-devops-toolkit/llm_ci_runner/retry.py` has been battle-tested in production environments with proper exponential backoff, jitter, and transient error detection. Use its patterns for distinguishing between retryable (network issues, rate limits) and permanent errors (authentication, malformed schemas).

2. **Schema Examples**: The schemas in `dev/ai-first-devops-toolkit/examples/` represent real-world, production-tested JSON Schema patterns:
   - `sentiment-analysis/schema.json`: Shows proper enum validation, number constraints, array handling
   - `pr-description/schema.json`: Demonstrates complex validation with minLength/maxLength, multiple enums, conditional requirements
   
3. **Validation Patterns**: The toolkit's approach to schema validation with Pydantic models provides a proven foundation - adapt their error handling and retry correction prompt patterns to TypeScript/AJV.

### Current Intelligence Considerations

The implementation leverages OpenAI's latest structured outputs with `response_format` when supported by providers, falling back to post-validation for providers that don't support structured outputs. AJV v8+ provides the fastest and most secure JSON Schema validation with JIT compilation.

The p-retry integration follows current best practices with conditional retry logic that distinguishes between retryable validation failures and permanent errors (malformed schemas, security violations), **enhanced by the proven patterns from ai-first-devops-toolkit**.

### Testing Strategy

Following the established test pyramid (70% unit, 20% integration, 10% E2E), this phase adds comprehensive schema validation testing while maintaining the existing coverage balance. The mock AsyncGenerator patterns from reliability tests provide a proven foundation for testing schema validation behavior.