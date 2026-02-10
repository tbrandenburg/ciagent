# Feature: Provider Reliability

## Summary

Harden provider behavior in ciagent CLI by implementing comprehensive contract tests, error normalization, retry/backoff logic, and consistent authentication failure handling across all LLM providers (Codex, Claude, Azure OpenAI). This ensures reliable operation in production CI/CD environments with predictable error handling and automatic recovery from transient failures.

## User Story

As a DevOps engineer running ciagent in CI/CD pipelines
I want the CLI to handle provider failures gracefully with automatic retries and clear error messages
So that my automation workflows are resilient to transient network issues and provide actionable failure diagnostics

## Problem Statement

Currently, provider failures in ciagent result in inconsistent error handling, no automatic retry for transient failures, and unclear user guidance for resolution. This makes the CLI unreliable in production CI/CD environments where network instability and rate limiting are common. The existing provider abstraction lacks contract validation and unified error normalization across different SDK behaviors.

## Solution Statement

Implement a reliability wrapper around the existing IAssistantChat interface that provides automatic retry with exponential backoff, normalizes errors from different provider SDKs into consistent CLI errors, validates provider contract compliance, and offers actionable error messages with specific suggestions for resolution.

## Metadata

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Type                   | ENHANCEMENT                                       |
| Complexity             | MEDIUM                                            |
| Systems Affected       | Provider abstraction, CLI commands, error handling |
| Dependencies           | @humanwhocodes/retry v2.0.0+, vitest, existing provider SDKs |
| Estimated Tasks        | 7                                                 |
| **Research Timestamp** | **2026-02-10T23:25:00Z (Real-time verification completed)** |

---

## UX Design

### Before State
```
┌─────────────┐    Network    ┌─────────────┐         ┌─────────────┐
│  CLI User   │ ──── Error ──► │  Provider   │ ──────► │  Raw Error  │
│             │               │   SDK       │         │  Message    │
└─────────────┘               └─────────────┘         └─────────────┘
                                      │                        │
                                      ▼                        ▼
                               ┌─────────────┐         ┌─────────────┐
                               │  Timeout    │         │   Process   │
                               │  Failure    │ ──────► │   Exit 1    │
                               └─────────────┘         └─────────────┘

USER_FLOW: SDK Error → Generic CLI Error → Exit Code 1
PAIN_POINT: No retry, inconsistent errors, no actionable guidance
```

### After State
```
┌─────────────┐    Network    ┌─────────────┐    Normalized    ┌──────────┐
│  CLI User   │ ──── Error ──► │  Reliable   │ ────────────────► │ Actionable│
│             │               │  Provider   │                  │  Error    │
└─────────────┘               │   Wrapper   │                  │ Message   │
                              └─────────────┘                  └──────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │    Retry    │ ◄── Exponential Backoff
                              │   Logic     │
                              └─────────────┘
                                     │
                                     ▼
                              ┌─────────────┐         ┌─────────────┐
                              │  Contract   │ ──────► │  Success    │
                              │ Validation  │         │  Response   │
                              └─────────────┘         └─────────────┘

USER_FLOW: SDK Error → Retry Logic → Contract Check → Exit Code
VALUE_ADD: Automatic recovery, consistent errors, actionable guidance
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `cia run` with network error | Exit 1 with generic message | Automatic retry + success or specific error | Workflows succeed on transient failures |
| Provider auth failures | Inconsistent error formats | Standardized auth error with clear suggestions | Clear guidance on credential setup |
| Rate limiting | Hard failure | Backoff retry with progress indication | Automatic handling of API limits |
| Contract violations | Silent failures or crashes | Validation errors with provider details | Early detection of provider issues |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/shared/errors/error-handling.ts` | 1-108 | Error factory patterns to EXTEND exactly |
| P0 | `packages/cli/src/providers/types.ts` | 1-12 | IAssistantChat interface to WRAP |
| P1 | `packages/cli/tests/providers.contract.test.ts` | 1-126 | Contract testing patterns to MIRROR |
| P1 | `packages/cli/src/shared/config/loader.ts` | 1-150 | Configuration patterns for retry settings |
| P2 | `packages/cli/src/commands/run.ts` | 27-94 | Provider integration point to UPDATE |
| P2 | `packages/cli/src/providers/codex.ts` | 88-113 | Existing error handling to ENHANCE |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [p-retry v8.1.0](https://context7.com/sindresorhus/p-retry/llms.txt#configure-exponential-backoff-retry-timing) ✓ Current | Exponential backoff configuration | Modern retry patterns with jitter | 2026-02-10T23:20:00Z |
| [Vitest v4.0.7](https://context7.com/vitest-dev/vitest/llms.txt#completely-mocking-a-module-with-vitest-vi.mock) ✓ Current | Module mocking patterns | Contract testing implementation | 2026-02-10T23:22:00Z |
| [OWASP ASVS v5.0.0](https://owasp.org/www-project-application-security-verification-standard/) ✓ Current | Error handling security | Secure error message practices | 2026-02-10T23:24:00Z |

---

## Patterns to Mirror

**ERROR_HANDLING_FACTORY:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:36-108
// COPY THIS PATTERN:
export const CommonErrors = {
  authConfig: (details: string): CliError =>
    createError(
      ExitCode.AUTH_CONFIG,
      'Authentication/configuration error',
      details,
      'Configure Codex auth at ~/.codex/auth.json and retry'
    ),
  executionFailed: (reason: string): CliError =>
    createError(
      ExitCode.LLM_EXECUTION,
      'AI execution failed',
      reason,
      'Try again with different parameters or check your configuration'
    ),
  timeout: (duration: number): CliError =>
    createError(
      ExitCode.TIMEOUT,
      `Operation timed out after ${duration}s`,
      'The AI provider took too long to respond',
      'Try increasing --timeout or check your network connection'
    ),
}
```

**PROVIDER_INTERFACE:**
```typescript
// SOURCE: packages/cli/src/providers/types.ts:1-12
// WRAP THIS INTERFACE:
export interface IAssistantChat {
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  getType(): string;
}
```

**CONTRACT_TESTING:**
```typescript
// SOURCE: packages/cli/tests/providers.contract.test.ts:6-13
// COPY THIS PATTERN:
const ALLOWED_CHUNK_TYPES = new Set<ChatChunk['type']>([
  'assistant', 'result', 'system', 'tool', 'thinking', 'error',
]);

// SOURCE: packages/cli/tests/providers.contract.test.ts:107-126
// MIRROR THIS VALIDATION:
it('both providers emit only allowed chunk types and result carries sessionId', async () => {
  const codexChunks = await collectChunks(codex.sendQuery('prompt', '/tmp'));
  for (const chunk of [...codexChunks, ...claudeChunks]) {
    expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
  }
  expect(codexResult?.sessionId).toBeTruthy();
});
```

**CONFIG_PATTERN:**
```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:16-18
// EXTEND THIS INTERFACE:
export interface CIAConfig {
  retries?: number;
  'retry-backoff'?: boolean;
  timeout?: number;
  // ADD: 'retry-timeout'?: number;
  // ADD: 'contract-validation'?: boolean;
}
```

**PROVIDER_CREATION:**
```typescript
// SOURCE: packages/cli/src/providers/index.ts:5-15
// WRAP THIS FACTORY:
export async function createAssistantChat(provider: string): Promise<IAssistantChat> {
  if (provider === 'codex') return CodexAssistantChat.create();
  if (provider === 'claude') return ClaudeAssistantChat.create();
  throw new Error(`Unsupported provider: ${provider}. Supported: codex, claude.`);
}
```

**CLI_INTEGRATION:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:27-50
// ENHANCE THIS FLOW:
const assistant = await createAssistantChat(provider);
let providerError: string | null = null;

for await (const chunk of assistant.sendQuery(prompt, process.cwd())) {
  if (chunk.type === 'error' && chunk.content) {
    providerError = chunk.content;
    break;
  }
}

if (providerError) {
  const error = CommonErrors.executionFailed(providerError);
  printError(error);
  return error.code;
}
```

---

## Current Best Practices Validation

**Security (OWASP ASVS v5.0.0 Verified):**
- ✅ Error messages must not expose sensitive configuration details
- ✅ Authentication failures properly classified vs other errors  
- ✅ Rate limiting handled without exposing API key details
- ✅ Retry logic includes reasonable limits to prevent DoS

**Performance (p-retry v8.1.0 Verified):**
- ✅ Exponential backoff with jitter prevents thundering herd
- ✅ Maximum retry limits prevent infinite loops
- ✅ Timeout configuration respects CI/CD pipeline constraints
- ✅ Memory efficient async generator patterns maintained

**Community Intelligence:**
- ✅ Modern retry patterns use factory functions with configuration objects
- ✅ Contract testing separates provider implementation from interface validation
- ✅ Error normalization maps provider-specific errors to standard categories
- ✅ Configuration layers support environment variables and CLI overrides

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `packages/cli/src/shared/config/loader.ts` | UPDATE | Add retry configuration options |
| `packages/cli/src/shared/errors/error-handling.ts` | UPDATE | Add provider reliability errors |
| `packages/cli/src/providers/reliability.ts` | CREATE | Reliability wrapper implementation |
| `packages/cli/src/providers/contract-validator.ts` | CREATE | Provider contract validation |
| `packages/cli/src/providers/index.ts` | UPDATE | Integrate reliability wrapper in factory |
| `packages/cli/tests/providers.reliability.test.ts` | CREATE | Reliability-focused tests |
| `packages/cli/tests/providers.contract.test.ts` | UPDATE | Extend contract validation |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **Circuit breaker pattern** - Defer to Phase 8 (advanced reliability features)
- **Provider health monitoring** - Out of scope, focus on request-level reliability
- **Metrics collection** - Not part of reliability hardening, separate concern
- **Custom retry strategies per provider** - Use unified exponential backoff approach
- **Persistent failure tracking** - CLI is stateless, no session persistence

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: build, functionally test, then run unit tests with coverage enabled. Use Makefile targets: `make validate-l1` (lint+type), `make validate-l2` (tests), `make build`.

**Coverage Target**: 40% (MVP level per PRD requirements)

### Task 1: UPDATE `packages/cli/src/shared/config/loader.ts`

- **ACTION**: ADD retry configuration options to CIAConfig interface and loading functions
- **IMPLEMENT**: `'retry-timeout'?: number`, `'contract-validation'?: boolean`, environment variable mapping
- **MIRROR**: `packages/cli/src/shared/config/loader.ts:16-18` - extend existing config pattern
- **IMPORTS**: No new imports needed, extend existing interface
- **GOTCHA**: Use kebab-case for CLI args, camelCase for TypeScript properties
- **CURRENT**: Configuration follows established environment variable precedence pattern
- **CONFIG_CONFLICTS**: None - extends existing configuration without conflicts
- **GENERATED_FILES**: None for configuration changes
- **VALIDATE**: `bun run type-check && bun run lint`
- **FUNCTIONAL**: Verify config loads retry settings from env vars and CLI args
- **TEST_PYRAMID**: No additional tests needed - configuration extension only

### Task 2: UPDATE `packages/cli/src/shared/errors/error-handling.ts`

- **ACTION**: ADD provider reliability-specific error creators to CommonErrors
- **IMPLEMENT**: `retryExhausted`, `contractViolation`, `providerUnreliable` error factories
- **MIRROR**: `packages/cli/src/shared/errors/error-handling.ts:36-108` - follow exact factory pattern
- **IMPORTS**: No new imports needed, extend existing CommonErrors object
- **TYPES**: Extend with new error creators following established createError pattern
- **GOTCHA**: Error suggestions must be actionable and specific to reliability issues
- **CURRENT**: Follows OWASP ASVS v5.0.0 secure error message practices
- **VALIDATE**: `bun run type-check && bun run lint`
- **TEST_PYRAMID**: No additional tests needed - error factory extensions only

### Task 3: CREATE `packages/cli/src/providers/contract-validator.ts`

- **ACTION**: CREATE provider contract validation utility
- **IMPLEMENT**: validateChunkTypes, validateSessionId, createValidationError functions
- **MIRROR**: `packages/cli/tests/providers.contract.test.ts:6-13` - use same validation logic
- **IMPORTS**: `import { ChatChunk } from './types'`, `import { createError, ExitCode } from '../shared/errors/error-handling'`
- **GOTCHA**: Validation must handle edge cases like undefined sessionId gracefully
- **CURRENT**: Contract validation ensures provider compliance with IAssistantChat interface
- **VALIDATE**: `bun run type-check && bun run lint`
- **TEST_PYRAMID**: Add integration test for: validation functions with various chunk scenarios and error conditions

### Task 4: CREATE `packages/cli/src/providers/reliability.ts`

- **ACTION**: CREATE reliability wrapper around IAssistantChat interface
- **IMPLEMENT**: ReliableAssistantChat class with retry logic, error normalization, contract validation
- **MIRROR**: `packages/cli/src/providers/types.ts:1-12` - implement IAssistantChat interface
- **IMPORTS**: `import pRetry from 'p-retry'`, `import { IAssistantChat, ChatChunk } from './types'`, `import { CommonErrors } from '../shared/errors/error-handling'`
- **PATTERN**: Wrapper pattern that decorates existing provider instances
- **CURRENT**: Uses p-retry v8.1.0 with exponential backoff and jitter configuration
- **VALIDATE**: `bun run type-check && bun run lint`
- **TEST_PYRAMID**: Add E2E test for: complete retry workflow with network failures, auth errors, and contract violations

### Task 5: CREATE `packages/cli/tests/providers.reliability.test.ts`

- **ACTION**: CREATE comprehensive reliability testing suite
- **IMPLEMENT**: Test retry behavior, error normalization, contract validation, timeout handling
- **MIRROR**: `packages/cli/tests/providers.contract.test.ts:1-126` - follow existing test structure
- **PATTERN**: Use Vitest mock patterns for simulating provider failures and network issues
- **IMPORTS**: `import { vi, describe, it, expect, beforeEach } from 'vitest'`, `import { ReliableAssistantChat } from '../src/providers/reliability'`
- **CURRENT**: Uses Vitest v4.0.7 module mocking patterns for comprehensive failure simulation
- **VALIDATE**: `bun test packages/cli/tests/providers.reliability.test.ts`
- **TEST_PYRAMID**: Add critical user journey test for: end-to-end reliability covering all major failure scenarios

### Task 6: UPDATE `packages/cli/tests/providers.contract.test.ts`

- **ACTION**: EXTEND existing contract tests with reliability validation
- **IMPLEMENT**: Add tests for contract validation errors, reliability wrapper compliance
- **MIRROR**: `packages/cli/tests/providers.contract.test.ts:107-126` - extend existing validation pattern
- **PATTERN**: Reuse existing contract validation but test through reliability wrapper
- **GOTCHA**: Ensure tests cover both direct provider failures and reliability wrapper scenarios
- **CURRENT**: Maintains existing contract test structure while adding reliability scenarios
- **VALIDATE**: `bun test packages/cli/tests/providers.contract.test.ts`
- **TEST_PYRAMID**: No additional tests needed - extension of existing contract validation

### Task 7: UPDATE `packages/cli/src/providers/index.ts`

- **ACTION**: INTEGRATE reliability wrapper in provider factory
- **IMPLEMENT**: Wrap provider instances with ReliableAssistantChat based on configuration
- **MIRROR**: `packages/cli/src/providers/index.ts:5-15` - extend existing factory pattern
- **IMPORTS**: `import { ReliableAssistantChat } from './reliability'`, `import { loadConfig } from '../shared/config/loader'`
- **PATTERN**: Conditional wrapping based on reliability configuration settings
- **GOTCHA**: Maintain backward compatibility - reliability features should be opt-in via config
- **CURRENT**: Factory pattern integration maintains existing provider creation while adding reliability
- **VALIDATE**: `bun run type-check && bun run build && bun run test && bun packages/cli/src/cli.ts run "test prompt"`
- **FUNCTIONAL**: `bun packages/cli/src/cli.ts run --retries 3 "Hello world"` - verify retry configuration works
- **TEST_PYRAMID**: Add critical user journey test for: complete CLI workflow with reliability enabled covering auth, network, and success scenarios

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
|-----------|------------|-----------|
| `packages/cli/tests/providers.reliability.test.ts` | retry logic, error normalization, timeout handling | Reliability wrapper |
| `packages/cli/tests/providers.contract.test.ts` | contract validation through wrapper | Interface compliance |
| `packages/cli/tests/shared/config/loader.test.ts` | retry config loading | Configuration extension |

### Edge Cases Checklist

- ✅ Network timeouts during provider calls
- ✅ Authentication failures vs transient errors
- ✅ Rate limiting with 429 responses
- ✅ Malformed responses violating ChatChunk contract
- ✅ Retry exhaustion after maximum attempts
- ✅ Provider returning undefined sessionId
- ✅ Mixed success/failure in async generator stream

---

## Validation Commands

**IMPORTANT**: Using actual governed commands from project Makefile and package.json.

### Level 1: STATIC_ANALYSIS

```bash
bun run lint && bun run type-check
```

**EXPECT**: Exit 0, no errors or warnings

### Level 2: BUILD_AND_FUNCTIONAL

```bash
bun run build && bun packages/cli/src/cli.ts --help
```

**EXPECT**: Build succeeds, CLI shows help with retry options

### Level 3: UNIT_TESTS

```bash
bun test -- --coverage packages/cli/tests/
```

**EXPECT**: All tests pass, coverage >= 40%

**COVERAGE NOTE**: For isolated module testing:
```bash
bun test -- --coverage --collectCoverageFrom="packages/cli/src/providers/" packages/cli/tests/providers.reliability.test.ts
```

### Level 4: FULL_SUITE

```bash
bun run ci
```

**EXPECT**: All tests pass, build succeeds (runs lint + type-check + test + build)

### Level 5: FUNCTIONAL_VALIDATION

Use existing CLI to verify reliability features:

```bash
# Test retry configuration
CIA_RETRIES=3 bun packages/cli/src/cli.ts run "test prompt"

# Test contract validation
CIA_CONTRACT_VALIDATION=true bun packages/cli/src/cli.ts run "test prompt"

# Test timeout handling
CIA_TIMEOUT=5 bun packages/cli/src/cli.ts run "test prompt"
```

### Level 6: CURRENT_STANDARDS_VALIDATION

Manual verification of implementation against research:

- ✅ Retry patterns use exponential backoff with jitter
- ✅ Error messages provide actionable suggestions without exposing credentials
- ✅ Contract validation catches provider compliance issues
- ✅ Configuration follows established precedence patterns

---

## Acceptance Criteria

- ✅ All specified reliability functionality implemented per user story
- ✅ Level 1-4 validation commands pass with exit 0
- ✅ Unit tests cover >= 40% of new reliability code
- ✅ Code mirrors existing patterns exactly (error handling, config, provider interface)
- ✅ No regressions in existing provider contract tests
- ✅ UX matches "After State" diagram (automatic retry + actionable errors)
- ✅ Implementation follows current best practices (p-retry v8.1.0, OWASP ASVS v5.0.0)
- ✅ No deprecated patterns or vulnerable retry implementations
- ✅ Security error messages don't leak sensitive configuration

---

## Completion Checklist

- ✅ All 7 tasks completed in dependency order
- ✅ Each task validated immediately after completion
- ✅ Level 1: Static analysis (lint + type-check) passes
- ✅ Level 2: Build and functional validation passes
- ✅ Level 3: Unit tests pass with coverage >= 40%
- ✅ Level 4: Full CI suite succeeds
- ✅ Level 5: Functional validation of reliability features passes
- ✅ Level 6: Current standards validation completed
- ✅ All acceptance criteria met

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 2 (p-retry patterns, Vitest mocking)
**Web Intelligence Sources**: 2 (Node.js async patterns, OWASP security standards)
**Last Verification**: 2026-02-10T23:25:00Z
**Security Advisories Checked**: 1 (OWASP ASVS current recommendations)
**Deprecated Patterns Avoided**: Legacy retry libraries, insecure error logging, non-jittered backoff

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-------------|
| Retry logic introduces latency in CI/CD | MEDIUM | MEDIUM | Configurable timeout limits, fail-fast on non-retryable errors |
| Provider SDK changes break reliability wrapper | LOW | HIGH | Contract tests detect interface violations early |
| Error normalization masks important provider details | MEDIUM | MEDIUM | Preserve original error context in debug mode |
| Documentation changes during implementation | LOW | MEDIUM | Context7 MCP re-verification during execution |
| Security vulnerabilities in p-retry dependency | LOW | HIGH | Real-time security advisory monitoring, version pinning |

---

## Notes

### Current Intelligence Considerations

This plan incorporates real-time verification of:
- **p-retry v8.1.0**: Modern exponential backoff with jitter prevents thundering herd problems
- **Vitest v4.0.7**: Module mocking patterns for comprehensive provider failure simulation
- **OWASP ASVS v5.0.0**: Secure error message practices that don't expose sensitive configuration
- **Community patterns**: Factory-based retry configuration and interface wrapper approaches

The existing codebase shows excellent patterns for error handling and provider abstraction. The reliability enhancement builds on these patterns rather than replacing them, ensuring consistency with the established architecture while adding robust failure recovery capabilities essential for production CI/CD environments.

The implementation maintains the stateless CLI principle while adding temporal reliability through retry logic, striking the right balance between robustness and simplicity as outlined in the PRD's core design philosophy.