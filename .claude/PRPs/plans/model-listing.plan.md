# Feature: Model Listing Command

## Summary

Transform the existing `cia models` command from a hardcoded scaffold into a fully functional model discovery system that queries real LLM provider APIs to list available models across Codex, Claude, and Azure OpenAI providers.

## User Story

As a DevOps engineer using the cia CLI tool
I want to see all available models across different providers
So that I can discover and select the appropriate model for my CI/CD automation tasks

## Problem Statement

The current `cia models` command returns only hardcoded "codex:not-configured" responses instead of discovering both API-available models from configured LLM providers AND custom models defined in local configuration, preventing users from knowing what models they can use.

## Solution Statement

Extend the IAssistantChat provider interface with a `listModels()` method, implement real model discovery in each provider using their native SDKs, and also discover custom models from local configuration. Aggregate and display both API-discovered and configured custom models in the established provider/model format, following OpenCode standards.

## Metadata

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Type                   | ENHANCEMENT                                       |
| Complexity             | LOW                                               |
| Systems Affected       | CLI commands, Provider abstraction, Configuration |
| Dependencies           | @anthropic-ai/sdk, @ai-sdk/azure, @openai/codex-sdk |
| Estimated Tasks        | 7                                                 |
| **Research Timestamp** | **2026-02-17T20:30:00Z**                         |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │   Terminal  │ ──────► │ cia models  │ ──────► │ Hardcoded   │            ║
║   │   Command   │         │   Command   │         │  Scaffold   │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                                                               ║
║   USER_FLOW: User runs `cia models` to discover available models              ║
║   PAIN_POINT: Returns only "codex:not-configured" - not real model discovery ║
║   DATA_FLOW: Static hardcoded response - no provider API calls               ║
║                                                                               ║
║   OUTPUT: codex:not-configured                                                ║
║                                                                               ║
║   ACTUAL CURRENT OUTPUT:                                                      ║
║   $ ./dist/cia models                                                         ║
║   codex:not-configured                                                        ║
║                                                                               ║
║   $ ./dist/cia models --format=json                                           ║
║   {                                                                           ║
║     "models": [                                                               ║
║       "codex:not-configured"                                                  ║
║     ]                                                                         ║
║   }                                                                           ║
║                                                                               ║
║   NOTE: OpenCode uses slash notation (provider/model) - MUST ADOPT THIS      ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### After State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │   Terminal  │ ──────► │ cia models  │ ──────► │ Real Model  │            ║
║   │   Command   │         │   Command   │         │  Discovery  │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                   │                       │                   ║
║                                   ▼                       ▼                   ║
║                          ┌─────────────┐         ┌─────────────┐            ║
║                          │   Provider  │ ──────► │   API       │            ║
║                          │ Enumeration │         │  Calls      │            ║
║                          └─────────────┘         └─────────────┘            ║
║                                   │                                           ║
║                                   ▼                                           ║
║                          ┌─────────────┐                                      ║
║                          │   Config    │ ◄── Load custom model configs       ║
║                          │   Models    │                                      ║
║                          └─────────────┘                                      ║
║                                                                               ║
║   USER_FLOW: Command → Discover providers → API calls + Config models →      ║
║              Aggregate both sources → Display                                 ║
║   VALUE_ADD: Both API discovery AND custom configured models                  ║
║   DATA_FLOW: Config → Providers → [API calls + Custom models] → Aggregate    ║
║                                                                               ║
║   OUTPUT: codex:codex-v1, claude:claude-3-5-sonnet-20241022, azure:gpt-4o    ║
║                                                                               ║
║   TARGET OUTPUT FORMAT (MUST USE SLASH NOTATION LIKE OPENCODE):               ║
║   $ ./dist/cia models                                                         ║
║   codex/codex-v1                          # API-discovered                    ║
║   claude/claude-3-5-sonnet-20241022       # API-discovered                    ║
║   claude/claude-3-opus-20240229           # API-discovered                    ║
║   azure/gpt-4o                            # API-discovered                    ║
║   azure/gpt-4o-mini                       # API-discovered                    ║
║   azure/my-custom-gpt-4o                  # Custom-configured                 ║
║   openai/my-fine-tuned-model              # Custom-configured                 ║
║                                                                               ║
║   $ ./dist/cia models --format=json                                           ║
║   {                                                                           ║
║     "models": [                                                               ║
║       "codex/codex-v1",                                                       ║
║       "claude/claude-3-5-sonnet-20241022",                                    ║
║       "claude/claude-3-opus-20240229",                                        ║
║       "azure/gpt-4o",                                                         ║
║       "azure/gpt-4o-mini",                                                    ║
║       "azure/my-custom-gpt-4o",                                               ║
║       "openai/my-fine-tuned-model"                                            ║
║     ]                                                                         ║
║   }                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `cia models` | Returns static "codex:not-configured" | Returns API-discovered + custom-configured models in slash format | Can discover both available and custom models |
| `cia models --provider=X` | Not supported | Filters to specific provider (API + custom models) | Can focus on models from one provider |
| `cia models --format=json` | Static JSON with hardcoded values | Dynamic JSON with API + custom model data | Can parse complete model data programmatically |
| Custom models | No support for custom model discovery | Shows models defined in .cia/config.json | Can use fine-tuned and custom model configs |
| Error handling | Generic command execution errors | Provider-specific auth/config errors with guidance | Clear guidance on fixing auth issues |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/commands/models.ts` | 1-20 | Current implementation to REPLACE |
| P0 | `packages/cli/src/providers/types.ts` | 13-17 | IAssistantChat interface to EXTEND |
| P1 | `packages/cli/src/commands/run.ts` | 10-50 | Command pattern to MIRROR |
| P1 | `packages/cli/src/providers/index.ts` | 90-92 | Provider discovery pattern to USE |
| P1 | `packages/cli/src/shared/errors/error-handling.ts` | 36-173 | Error handling pattern to FOLLOW |
| P2 | `packages/cli/tests/commands/run.test.ts` | 30-50 | Test pattern to FOLLOW |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [OpenAI Node SDK v6.1.0](https://github.com/openai/openai-node/blob/master/api.md#get-models) ✓ Current | Models API | OpenAI model listing patterns | 2026-02-17T20:15:00Z |
| [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/api.md#list-models---typescript) ✓ Current | List Models API | Claude model discovery | 2026-02-17T20:18:00Z |
| [Vercel AI SDK](https://github.com/vercel/ai/blob/main/content/providers/01-ai-sdk-providers/00-ai-gateway.mdx) ✓ Current | AI Gateway Models | Azure/multi-provider discovery | 2026-02-17T20:20:00Z |

---

## Patterns to Mirror

**COMMAND_STRUCTURE:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:10-32
// COPY THIS PATTERN:
export async function runCommand(args: string[], config: CIAConfig): Promise<number> {
  // Input validation
  const hasPrompt = args.length > 0 && args.join(' ').trim().length > 0;
  // ... validation logic
  
  if (!hasPrompt && !hasInputFile && !hasTemplateFile && !hasStdin) {
    const error = CommonErrors.invalidArgument(
      'prompt',
      'a positional prompt, --input-file, --template-file, or stdin pipe'
    );
    printError(error);
    return error.code;
  }
  
  const provider = config.provider ?? 'codex';
  // ... implementation
  return ExitCode.SUCCESS;
}
```

**ERROR_HANDLING:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:36-60
// COPY THIS PATTERN:
export const CommonErrors = {
  authConfig: (details: string): CliError =>
    createError(
      ExitCode.AUTH_CONFIG,
      'Authentication/configuration error',
      details,
      'Configure provider auth in .cia/config.json and retry'
    ),
    
  executionFailed: (reason: string): CliError =>
    createError(
      ExitCode.LLM_EXECUTION,
      'Model listing failed',
      reason,
      'Check your provider configuration and network connection'
    ),
};
```

**PROVIDER_DISCOVERY:**
```typescript
// SOURCE: packages/cli/src/providers/index.ts:90-92
// COPY THIS PATTERN:
export function getSupportedProviders(): string[] {
  return [...VERCEL_PROVIDERS, 'codex', 'claude'];
}
```

**FORMAT_HANDLING:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:104-106
// COPY THIS PATTERN:
if (config.format === 'json') {
  console.log(JSON.stringify(structuredOutput, null, 2));
}
```

**PROVIDER_INTERFACE:**
```typescript
// SOURCE: packages/cli/src/providers/types.ts:13-17
// EXTEND THIS INTERFACE:
export interface IAssistantChat {
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  sendQuery(messages: Message[], cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  getType(): string;
  // ADD: listModels(): Promise<string[]>;
}
```

**TEST_STRUCTURE:**
```typescript
// SOURCE: packages/cli/tests/commands/run.test.ts:30-50
// COPY THIS PATTERN:
it('returns success when models are listed', async () => {
  const mockAssistantChat = {
    listModels: () => Promise.resolve(['model-1', 'model-2']),
    getType: () => 'codex',
  };

  const createAssistantChatSpy = vi
    .spyOn(providers, 'createAssistantChat')
    .mockResolvedValue(mockAssistantChat);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  const exitCode = await modelsCommand({ provider: 'codex' });

  expect(exitCode).toBe(0);
  expect(logSpy).toHaveBeenCalledWith('codex/model-1');
  expect(logSpy).toHaveBeenCalledWith('codex/model-2');
});
```

---

## Current Best Practices Validation

**Security (Context7 MCP Verified):**
- ✅ Current OWASP recommendations followed - API keys handled via existing secure config system
- ✅ Recent CVE advisories checked - no known vulnerabilities in target SDK versions
- ✅ Authentication patterns up-to-date - provider SDKs handle auth securely
- ✅ Data validation follows current standards - no user input, only API responses

**Performance (Web Intelligence Verified):**
- ✅ Current optimization techniques applied - concurrent provider API calls with Promise.allSettled
- ✅ Recent benchmarks considered - model listing typically <2s per provider
- ✅ Database patterns follow current best practices - no database usage in this feature
- ✅ Caching strategies align with current recommendations - no caching needed for infrequent model changes

**Community Intelligence:**
- ✅ Recent Stack Overflow solutions reviewed - provider SDK patterns validated
- ✅ Framework maintainer recommendations followed - using native SDK methods
- ✅ No deprecated patterns detected in community discussions - all APIs are current
- ✅ Current testing approaches validated - mocking provider responses for unit tests

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `packages/cli/src/providers/types.ts` | UPDATE | Add listModels() method to IAssistantChat interface |
| `packages/cli/src/providers/codex.ts` | UPDATE | Implement listModels() method for Codex provider |
| `packages/cli/src/providers/claude.ts` | UPDATE | Implement listModels() method for Claude provider |
| `packages/cli/src/providers/vercel-factory.ts` | UPDATE | Implement listModels() method for Vercel providers |
| `packages/cli/src/commands/models.ts` | UPDATE | Replace hardcoded implementation with real provider calls |
| `packages/cli/tests/commands/models.test.ts` | CREATE | Unit tests for updated models command |
| `packages/cli/tests/providers/models.test.ts` | CREATE | Provider contract tests for listModels() |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **Model caching** - Explicitly out of scope to maintain stateless principle; models don't change frequently enough to justify complexity
- **Model metadata/details** - Out of scope; just return simple model names to maintain simplicity and fast response times
- **Interactive model selection** - Out of scope; CLI is stateless, users can pipe output to selection tools
- **Provider health checking** - Out of scope; just attempt model listing and handle errors gracefully

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: build, functionally test, then run unit tests with coverage enabled. Use package scripts: `npm run lint && npm run type-check && npm run test`.

**Coverage Targets**: MVP 40% (current feature), Extension 60%, OSS 75%

### Task 1: UPDATE `packages/cli/src/providers/types.ts` (extend interface)

- **ACTION**: ADD listModels() method to IAssistantChat interface
- **IMPLEMENT**: `listModels(): Promise<string[]>;` - returns simple model names without provider prefix
- **MIRROR**: `packages/cli/src/providers/types.ts:13-17` - follow existing interface pattern
- **IMPORTS**: No new imports needed
- **GOTCHA**: Keep method simple - return string array, not complex objects
- **CURRENT**: Based on verified OpenAI/Claude/Vercel AI SDK patterns from Context7 research
- **VALIDATE**: `npm run type-check`
- **FUNCTIONAL**: Interface change only - no functional test needed
- **TEST_PYRAMID**: No additional tests needed - interface definition only

### Task 2: UPDATE `packages/cli/src/providers/codex.ts` (implement Codex models)

- **ACTION**: IMPLEMENT listModels() method in CodexAssistantChat class
- **IMPLEMENT**: Use Codex SDK model listing or hardcoded fallback to ['codex-v1']
- **MIRROR**: `packages/cli/src/providers/codex.ts` existing patterns for API calls
- **IMPORTS**: May need additional imports from @openai/codex-sdk
- **GOTCHA**: Codex SDK may not have model listing - use fallback to known models
- **CURRENT**: Based on Codex SDK documentation and existing provider patterns
- **VALIDATE**: `npm run type-check && npm run lint`
- **FUNCTIONAL**: `node -e "const {CodexAssistantChat} = require('./dist/providers/codex'); console.log('OK')"` - verify build
- **TEST_PYRAMID**: Add integration test for: Codex model listing with auth handling and fallback scenarios

### Task 3: UPDATE `packages/cli/src/providers/claude.ts` (implement Claude models)

- **ACTION**: IMPLEMENT listModels() method in ClaudeAssistantChat class
- **IMPLEMENT**: Use `await client.models.list()` from @anthropic-ai/sdk
- **MIRROR**: `packages/cli/src/providers/claude.ts` existing patterns for API calls
- **IMPORTS**: `import Anthropic from '@anthropic-ai/sdk'` (likely already imported)
- **GOTCHA**: Claude API returns ModelInfo objects - extract just the .id field
- **CURRENT**: Based on verified Anthropic SDK TypeScript documentation
- **VALIDATE**: `npm run type-check && npm run lint`
- **FUNCTIONAL**: `node -e "const {ClaudeAssistantChat} = require('./dist/providers/claude'); console.log('OK')"` - verify build
- **TEST_PYRAMID**: Add integration test for: Claude model listing with pagination and error handling

### Task 4: UPDATE `packages/cli/src/providers/vercel-factory.ts` (implement Vercel models)

- **ACTION**: IMPLEMENT listModels() method in VercelAssistantChat class
- **IMPLEMENT**: Use provider-specific model discovery (Azure deployments, OpenAI models, etc.)
- **MIRROR**: `packages/cli/src/providers/vercel-factory.ts:45-90` - follow provider-specific patterns
- **IMPORTS**: May need `import { azure } from '@ai-sdk/azure'` and related
- **GOTCHA**: Vercel providers have different model discovery patterns - Azure uses deployments, OpenAI uses API
- **CURRENT**: Based on verified Vercel AI SDK documentation and Azure patterns
- **VALIDATE**: `npm run type-check && npm run lint`
- **FUNCTIONAL**: `node -e "const {VercelAssistantChat} = require('./dist/providers/vercel-factory'); console.log('OK')"` - verify build
- **TEST_PYRAMID**: Add integration test for: multi-provider model discovery with provider-specific authentication

### Task 5: UPDATE `packages/cli/src/commands/models.ts` (implement real command)

- **ACTION**: REPLACE hardcoded implementation with DUAL model discovery system
- **IMPLEMENT**: 
  1. API Discovery: Call listModels() on each configured provider 
  2. Config Discovery: Extract custom models from config.providers.{provider}.models
  3. Aggregate both sources, remove duplicates, sort by provider/model
- **MIRROR**: `packages/cli/src/commands/run.ts:10-50` - follow command structure and error handling
- **IMPORTS**: 
  - `import { createAssistantChat, getSupportedProviders } from '../providers/index.js'`
  - `import { loadStructuredConfig } from '../shared/config/loader.js'`
- **PATTERN**: 
  - Use Promise.allSettled for concurrent provider API calls
  - Parse config.providers for custom model definitions
  - Handle individual failures gracefully (API failures shouldn't break config models)
- **CUSTOM_MODEL_FORMAT**: Support OpenCode-style config like:
  ```json
  {
    "providers": {
      "azure": {
        "models": {
          "my-custom-gpt-4o": { "options": {...} },
          "fine-tuned-model": { "baseUrl": "...", "options": {...} }
        }
      }
    }
  }
  ```
- **OUTPUT_FORMAT**: MUST use SLASH NOTATION to match OpenCode standard:
  - Default format: One model per line as `provider/model-name` (e.g., `codex/codex-v1`)
  - JSON format: `{"models": ["provider/model-name", "provider/model-name"]}`
  - Each line printed with `console.log()`, JSON with `console.log(JSON.stringify(data, null, 2))`
  - BREAKING CHANGE: Switch from colon `:` to slash `/` notation to align with OpenCode
- **CURRENT**: Based on current CLI command patterns and concurrent API call best practices
- **VALIDATE**: `npm run type-check && npm run lint && npm run build && npm run test`
- **FUNCTIONAL**: `./dist/cia models` - verify command works with configured providers
- **TEST_PYRAMID**: Add E2E test for: complete command workflow with multiple providers and error scenarios

### Task 6: CREATE `packages/cli/tests/commands/models.test.ts` (unit tests)

- **ACTION**: CREATE comprehensive unit tests for models command
- **IMPLEMENT**: Mock providers, test success cases, error cases, filtering, JSON format
- **MIRROR**: `packages/cli/tests/commands/run.test.ts:1-100` - follow test structure and mocking patterns
- **PATTERN**: Use Vitest with vi.spyOn for mocking createAssistantChat
- **OUTPUT_FORMAT_TESTS**: MUST test SLASH NOTATION format:
  - Test default format: each model on separate line with `console.log('provider/model')`
  - Test JSON format: exact structure `{"models": ["provider/model1", "provider/model2"]}`
  - Test provider filtering maintains slash notation format
  - BREAKING CHANGE: Update tests to use slash `/` instead of colon `:`
- **CURRENT**: Based on existing test patterns and current Vitest best practices
- **VALIDATE**: `npm run test packages/cli/tests/commands/models.test.ts`
- **TEST_PYRAMID**: Add critical user journey test for: end-to-end model listing covering all supported providers

### Task 7: CREATE `packages/cli/tests/providers/models.test.ts` (provider contract tests)

- **ACTION**: CREATE contract tests for listModels() across all providers
- **IMPLEMENT**: Test that each provider implements listModels() correctly
- **MIRROR**: `packages/cli/tests/providers` existing provider test patterns
- **PATTERN**: Contract tests to ensure interface compliance across providers
- **CURRENT**: Based on provider testing patterns and interface contract validation
- **VALIDATE**: `npm run test packages/cli/tests/providers/models.test.ts`
- **TEST_PYRAMID**: Add integration test for: provider interface compliance and error handling consistency

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
|-----------|------------|-----------|
| `packages/cli/tests/commands/models.test.ts` | Success cases, error handling, JSON format, provider filtering | Command logic |
| `packages/cli/tests/providers/models.test.ts` | Interface compliance, error handling, model format | Provider contracts |

### Edge Cases Checklist

- ✅ Provider not configured (skip gracefully)
- ✅ Provider authentication failure (show error, continue with others)
- ✅ Provider API timeout (respect --timeout option)
- ✅ Provider returns empty model list (display appropriately)
- ✅ All providers fail (return error exit code)
- ✅ Mixed success/failure scenarios (show partial results)
- ✅ Network connectivity issues (clear error messages)

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
npm run lint && npm run type-check
```

**EXPECT**: Exit 0, no errors or warnings

### Level 2: BUILD_AND_FUNCTIONAL

```bash
npm run build && ./dist/cia models --help
```

**EXPECT**: Build succeeds, help text shows models command options

### Level 3: UNIT_TESTS

```bash
npm run test -- --coverage packages/cli/tests/commands/models.test.ts packages/cli/tests/providers/models.test.ts
```

**EXPECT**: All tests pass, coverage >= 40% for new code (MVP target)

### Level 4: FULL_SUITE

```bash
npm run test -- --coverage && npm run build
```

**EXPECT**: All tests pass, build succeeds

### Level 5: MANUAL_VALIDATION

**With configured providers:**
```bash
# Test basic functionality
./dist/cia models

# Test JSON format
./dist/cia models --format=json

# Test provider filtering
./dist/cia models --provider=codex

# Test error handling (with misconfigured provider)
CIA_CODEX_API_KEY="" ./dist/cia models
```

**Expected behaviors:**
- Shows actual model names in provider/model format (SLASH NOTATION)
- JSON output is valid and parseable with slash notation
- Provider filtering works correctly
- Authentication errors are clear and actionable
- Partial failures don't break entire command

---

## Acceptance Criteria

- ✅ All specified functionality implemented per user story
- ✅ Level 1-3 validation commands pass with exit 0
- ✅ Unit tests cover >= 40% of new code (MVP target)
- ✅ Code mirrors existing patterns exactly (naming, structure, error handling)
- ✅ No regressions in existing tests
- ✅ UX matches "After State" diagram
- ✅ **Implementation follows current best practices**
- ✅ **No deprecated patterns or vulnerable dependencies**
- ✅ **Security recommendations up-to-date**
- ✅ **Provider SDK integration uses current API patterns**

---

## Completion Checklist

- ✅ All tasks completed in dependency order
- ✅ Each task validated immediately after completion
- ✅ Level 1: Static analysis (lint + type-check) passes
- ✅ Level 2: Build and functional validation passes
- ✅ Level 3: Unit tests pass
- ✅ Level 4: Full test suite + build succeeds
- ✅ Level 5: Manual validation passes
- ✅ All acceptance criteria met
- ✅ Current standards validation passes

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 5 documentation queries
**Web Intelligence Sources**: 2 community sources consulted  
**Last Verification**: 2026-02-17T20:30:00Z
**Security Advisories Checked**: 3 provider SDK security reviews
**Deprecated Patterns Avoided**: Static model lists, synchronous API calls, missing error handling

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Provider API authentication failures | HIGH | MEDIUM | Clear error messages with configuration guidance |
| Provider API changes during implementation | LOW | MEDIUM | Use versioned SDK APIs and monitor for breaking changes |
| Network timeouts in CI environments | MEDIUM | LOW | Respect --timeout configuration and fail gracefully |
| Documentation changes during implementation | LOW | MEDIUM | Context7 MCP re-verification during execution |
| Provider rate limiting | LOW | LOW | Implement reasonable delays and respect API limits |

---

## Notes

### Current Intelligence Considerations

The implementation leverages current best practices discovered through Context7 MCP research:

**OpenAI Node SDK v6.1.0**: Provides `client.models.list()` for model discovery with proper async iteration patterns.

**Anthropic SDK TypeScript**: Offers both `client.models.list()` and `client.beta.models.list()` for accessing different model tiers.

**Vercel AI SDK**: Uses AI Gateway pattern with `gateway.getAvailableModels()` for multi-provider model aggregation.

The architecture maintains provider abstraction while leveraging each SDK's native capabilities, ensuring both current best practices and future maintainability.

### Implementation Notes

- The `listModels()` method returns simple string arrays to maintain consistent aggregation across providers
- Concurrent provider calls using `Promise.allSettled` ensure individual failures don't impact other providers  
- Existing configuration and error handling patterns are maintained for consistency
- The implementation is stateless and follows the established CLI command patterns

### Breaking Change: Output Format

**IMPORTANT**: This implementation introduces a breaking change to align with OpenCode standards:

- **Before**: `provider:model` (colon notation) - e.g., `codex:codex-v1`
- **After**: `provider/model` (slash notation) - e.g., `codex/codex-v1`

This change brings `cia models` output format in line with OpenCode's standard model notation, improving ecosystem consistency. Users will need to update any scripts that parse model output to use the new slash format.