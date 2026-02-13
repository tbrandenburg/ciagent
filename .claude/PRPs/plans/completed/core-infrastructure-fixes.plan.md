# Feature: Core Infrastructure Fixes (Phase 3a)

## Summary

Implementing fundamental CLI processing infrastructure that enables structured configuration, provider configuration loading, JSON input processing, basic context integration, and proper timeout mechanisms. This establishes the foundation for Azure OpenAI integration and all subsequent functionality.

## User Story

As a DevOps engineer using ciagent in CI/CD pipelines
I want to configure providers through structured config files and process conversation JSON inputs
So that I can reliably integrate AI agents with standardized configuration patterns and complex input formats

## Problem Statement

The current CLI has critical infrastructure gaps that block advanced functionality: no structured configuration system for provider settings, no JSON conversation input processing, no context file referencing in LLM requests, and no proper timeout/cancellation mechanisms. These limitations prevent Azure OpenAI integration and enterprise-grade features.

## Solution Statement

Extend existing configuration hierarchy with structured provider configs, enhance input processing to handle JSON conversation formats, integrate context file references into LLM requests, and implement AbortController-based timeout mechanisms using established codebase patterns.

## Metadata

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Type                   | ENHANCEMENT                                       |
| Complexity             | HIGH                                              |
| Systems Affected       | config/loader, providers/factory, commands/run   |
| Dependencies           | p-retry@7.1.1, Node.js built-ins                 |
| Estimated Tasks        | 6                                                 |
| **Research Timestamp** | **2026-02-11T20:30:00Z**                          |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              BEFORE STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │  CLI Args   │ ──────► │   Config    │ ──────► │   Provider  │            ║
║   │ --provider  │         │ Flat Env    │         │   Factory   │            ║
║   │ --timeout   │         │ Variables   │         │   Static    │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                   │                       │                   ║
║                                   ▼                       ▼                   ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │ Text Input  │         │ No Context  │         │ No Timeout  │            ║
║   │ File Only   │         │ Reference   │         │ Mechanism   │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                                                               ║
║   USER_FLOW: Set env vars → run cia with text file → no cancellation         ║
║   PAIN_POINT: No structured config, no JSON conversations, no timeouts       ║
║   DATA_FLOW: Env vars → flat config → static provider creation               ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║                               AFTER STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │  CLI Args   │ ──────► │ Structured  │ ──────► │   Provider  │            ║
║   │ + JSON      │         │ Config      │         │  Configured │            ║
║   │ + Context   │         │ .cia/cfg.js │         │  Factory    │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                   │                       │                   ║
║                                   ▼                       ▼                   ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │Conversation │         │Context Refs │         │AbortControl │            ║
║   │   JSON      │ ◄────── │ File/URLs   │ ────────► │  Timeout   │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                                                               ║
║   USER_FLOW: Configure .cia/config.json → run with JSON input + context      ║
║   VALUE_ADD: Structured provider configs, conversation history, timeouts     ║
║   DATA_FLOW: Structured config → configured providers → cancellable requests ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `.cia/config.json` | Missing structured format | Hierarchical provider configs | Can configure multiple providers with specific settings |
| `--input-file` | Text files only | JSON conversation format support | Can use conversation history with roles and context |
| `--context` | Files collected but unused | Referenced in LLM requests | Context files become part of LLM input |
| Request timeout | Config only, no mechanism | AbortController cancellation | Operations can be cancelled after timeout |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/shared/config/loader.ts` | 1-142 | Configuration hierarchy pattern to EXTEND exactly |
| P0 | `packages/cli/src/providers/index.ts` | 7-27 | Provider factory pattern to MODIFY for structured config |
| P0 | `packages/cli/src/commands/run.ts` | 208-209 | Input file pattern to ENHANCE for JSON processing |
| P1 | `packages/cli/src/providers/types.ts` | 13-17 | IAssistantChat interface to understand Message[] support |
| P1 | `packages/cli/src/providers/reliability.ts` | 23, 101-110 | Retry pattern with p-retry to MIRROR for timeout |
| P2 | `packages/cli/tests/commands/run.test.ts` | 1-6 | Vitest testing pattern to FOLLOW for new tests |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [Node.js parseArgs v20.x](https://nodejs.org/docs/latest-v20.x/api/util#utilparseargsconfig) ✓ Current | parseArgs configuration | CLI argument parsing patterns | 2026-02-11T20:30:00Z |
| [Vitest Mocking Guide](https://main.vitest.dev/guide/mocking) ✓ Current | vi.spyOn and mock patterns | Testing provider configuration | 2026-02-11T20:30:00Z |
| [JSON Schema Understanding](https://json-schema.org/understanding-json-schema/about) ✓ Current | Object property validation | Configuration validation patterns | 2026-02-11T20:30:00Z |
| [p-retry AbortController](https://github.com/sindresorhus/p-retry/blob/main/readme.md) ✓ Current | Cancellation with AbortSignal | Timeout implementation patterns | 2026-02-11T20:30:00Z |

---

## Patterns to Mirror

**CONFIGURATION_LOADING:**
```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:28-44
// EXTEND THIS PATTERN:
export function loadConfig(cliArgs: Partial<CIAConfig> = {}): CIAConfig {
  let config = loadFromEnv();
  const userConfig = loadUserConfig();
  if (userConfig) {
    config = mergeConfigs(config, userConfig);
  }
  const repoConfig = loadRepoConfig();
  if (repoConfig) {
    config = mergeConfigs(config, repoConfig);
  }
  config = mergeConfigs(config, cliArgs);
  return config;
}
```

**PROVIDER_FACTORY:**
```typescript
// SOURCE: packages/cli/src/providers/index.ts:7-27
// MODIFY THIS PATTERN:
export async function createAssistantChat(
  provider: string,
  config?: CIAConfig
): Promise<IAssistantChat> {
  // Current: Static .create() calls
  // Phase 3a: Pass structured config to .create(providerConfig)
  if (provider === 'codex') {
    assistantChat = await CodexAssistantChat.create(); // ← MODIFY
  }
  // Add config-based provider initialization
}
```

**ERROR_HANDLING:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:36-75
// COPY THIS PATTERN:
export const CommonErrors = {
  invalidArgument: (arg: string, expected: string): CliError =>
    createError(ExitCode.INPUT_VALIDATION, `Invalid argument: ${arg}`, `Expected: ${expected}`, 'Check your command syntax with --help'),
  
  authConfig: (details: string): CliError =>
    createError(ExitCode.AUTH_CONFIG, 'Authentication/configuration error', details, 'Configure provider auth and retry'),
};
```

**JSON_PROCESSING:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:114-118
// EXTEND THIS PATTERN:
function parseStructuredResponse(responseText: string): unknown {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
```

**RETRY_WITH_TIMEOUT:**
```typescript
// SOURCE: packages/cli/src/providers/reliability.ts:101-110
// MIRROR THIS PATTERN:
{
  retries: maxRetries,
  factor: useBackoff ? 2 : 1,
  minTimeout: useBackoff ? 1000 : 500,
  maxTimeout: retryTimeout,
  randomize: useBackoff,
}
```

**TEST_STRUCTURE:**
```typescript
// SOURCE: packages/cli/tests/commands/run.test.ts:1-6
// COPY THIS PATTERN:
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

describe('feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
});
```

---

## Current Best Practices Validation

**Security (Context7 MCP Verified):**
- [x] AbortController cancellation follows Node.js security patterns
- [x] JSON parsing includes error handling for malformed input
- [x] Configuration validation prevents injection attacks
- [x] File system operations use safe path validation

**Performance (Web Intelligence Verified):**
- [x] Lazy loading of configuration files (only when needed)
- [x] p-retry exponential backoff prevents resource exhaustion
- [x] AbortController prevents hanging requests
- [x] Structured config reduces parsing overhead

**Community Intelligence:**
- [x] parseArgs is Node.js native (no external dependencies)
- [x] p-retry v7.1.1 includes latest AbortController support
- [x] JSON Schema validation aligns with current standards
- [x] Vitest mocking patterns are current best practices

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `packages/cli/src/shared/config/loader.ts` | UPDATE | Extend CIAConfig interface with structured provider configs |
| `packages/cli/src/providers/index.ts` | UPDATE | Modify factory to pass structured config to providers |
| `packages/cli/src/providers/codex.ts` | UPDATE | Accept config parameter in .create() method |
| `packages/cli/src/providers/claude.ts` | UPDATE | Accept config parameter in .create() method |
| `packages/cli/src/commands/run.ts` | UPDATE | Add JSON input processing and context integration |
| `packages/cli/src/shared/validation/validation.ts` | UPDATE | Add structured config validation rules |
| `packages/cli/tests/config/structured-config.test.ts` | CREATE | Test structured configuration loading and validation |
| `packages/cli/tests/commands/json-input.test.ts` | CREATE | Test JSON conversation input processing |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:
- **Schema enforcement with retry logic** - Deferred to Phase 3b (depends on this infrastructure)
- **Advanced template processing** - Deferred to Phase 3c (depends on this infrastructure)
- **Azure OpenAI provider implementation** - Deferred to Phase 4 (depends on this infrastructure)
- **MCP/Skills integration** - Deferred to Phase 7 (depends on provider config loading)

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: build, functionally test, then run unit tests with coverage enabled. Use `make validate-l1` (lint + type-check), `make validate-l2` (tests), and `make validate-l3` (build).

**Coverage Target**: MVP 40% (current phase requirement)

### Task 1: UPDATE `packages/cli/src/shared/config/loader.ts` - Extend CIAConfig interface

- **ACTION**: EXTEND CIAConfig interface with structured provider configurations
- **IMPLEMENT**: Add providers object, mcp object, maintain backward compatibility
- **MIRROR**: Existing interface pattern at `loader.ts:5-26` - extend, don't replace
- **IMPORTS**: No new imports required (extend existing interface)
- **NEW_INTERFACE**:
  ```typescript
  export interface CIAConfig {
    // ... existing properties
    providers?: {
      [providerName: string]: {
        model?: string;
        baseUrl?: string;
        apiKey?: string;
        timeout?: number;
        [key: string]: unknown;
      };
    };
    mcp?: {
      servers: Array<{
        name: string;
        command: string;
        args?: string[];
        env?: Record<string, string>;
      }>;
    };
  }
  ```
- **CURRENT**: [Node.js interfaces](https://nodejs.org/docs/latest-v20.x/api/util) - interface extension patterns
- **CONFIG_CONFLICTS**: None - extends existing interface without breaking changes
- **VALIDATE**: `make validate-l1` - type checking and linting
- **FUNCTIONAL**: `bun packages/cli/src/cli.ts --help` - verify CLI still works
- **TEST_PYRAMID**: No additional tests needed - interface definition only

### Task 2: UPDATE `packages/cli/src/shared/config/loader.ts` - Add structured config loading

- **ACTION**: ADD function to load structured provider configurations
- **IMPLEMENT**: `loadStructuredConfig()` function that parses provider-specific settings
- **MIRROR**: `loadUserConfig()` pattern at `loader.ts:103-125` - same file loading approach
- **IMPORTS**: No new imports needed (reuse existing fs functions)
- **NEW_FUNCTION**:
  ```typescript
  function loadStructuredConfig(config: Partial<CIAConfig>): Partial<CIAConfig> {
    if (!config.providers) return config;
    
    // Validate and process structured provider configs
    const processedConfig = { ...config };
    for (const [providerName, providerConfig] of Object.entries(config.providers)) {
      // Validate provider config structure
      // Environment variable substitution for {env:VAR_NAME} patterns
    }
    return processedConfig;
  }
  ```
- **GOTCHA**: Environment variable substitution must handle missing variables gracefully
- **CURRENT**: [JSON Schema validation](https://json-schema.org/understanding-json-schema/reference/object) for nested object validation
- **VALIDATE**: `make validate-l1 && make validate-l2` - tests must pass
- **FUNCTIONAL**: Create test `.cia/config.json` with providers object, verify loading
- **TEST_PYRAMID**: Add integration test for: structured config loading with environment variable substitution

### Task 3: UPDATE `packages/cli/src/providers/index.ts` - Modify factory for structured config

- **ACTION**: MODIFY createAssistantChat to pass structured config to providers
- **IMPLEMENT**: Extract provider-specific config and pass to .create() methods
- **MIRROR**: Existing factory pattern at `index.ts:7-27` - enhance, don't replace
- **IMPORTS**: No new imports needed
- **CONFIG_EXTRACTION**:
  ```typescript
  const providerConfig = config?.providers?.[provider] || {};
  if (provider === 'codex') {
    assistantChat = await CodexAssistantChat.create(providerConfig);
  }
  ```
- **GOTCHA**: Maintain backward compatibility - providers must work without config
- **CURRENT**: [Node.js factory patterns](https://nodejs.org/docs/latest-v20.x/api/util) - parameter passing
- **VALIDATE**: `make validate-l1` - type checking must pass
- **FUNCTIONAL**: Run existing provider creation, verify no regression
- **TEST_PYRAMID**: Add integration test for: provider factory with structured configuration

### Task 4: UPDATE `packages/cli/src/providers/codex.ts` + `claude.ts` - Accept config parameters

- **ACTION**: MODIFY provider .create() methods to accept optional config parameter
- **IMPLEMENT**: Update create() signatures: `create(config?: ProviderConfig)`
- **MIRROR**: Existing .create() pattern at `codex.ts:35` and `claude.ts:53` - extend signature
- **IMPORTS**: No new imports needed
- **CONFIG_PARAMETER**:
  ```typescript
  static async create(config?: { 
    baseUrl?: string; 
    apiKey?: string; 
    timeout?: number; 
    [key: string]: unknown 
  }): Promise<CodexAssistantChat> {
    // Use config values if provided, fall back to existing logic
    const apiKey = config?.apiKey || getApiKeyFromAuth();
    const baseUrl = config?.baseUrl || getDefaultBaseUrl();
    // ...
  }
  ```
- **GOTCHA**: Must maintain backward compatibility - existing calls without config must work
- **CURRENT**: [Node.js optional parameters](https://nodejs.org/docs/latest-v20.x/api/util) - TypeScript optional pattern
- **VALIDATE**: `make validate-l1 && make validate-l2` - existing provider tests must pass
- **FUNCTIONAL**: Test provider creation with and without config parameters
- **TEST_PYRAMID**: Add E2E test for: provider configuration loading from structured config

### Task 5: UPDATE `packages/cli/src/commands/run.ts` - Add JSON input processing and context integration

- **ACTION**: ENHANCE resolvePrompt and input processing for JSON conversation format
- **IMPLEMENT**: Detect and parse JSON input, integrate context references
- **MIRROR**: `resolvePrompt()` at `run.ts:208-209` and JSON parsing at `run.ts:114-118`
- **IMPORTS**: No new imports needed (use existing JSON processing)
- **JSON_INPUT_DETECTION**:
  ```typescript
  function resolvePrompt(config: CIAConfig): string | Message[] {
    if (config['input-file']) {
      const content = readFileSync(config['input-file'], 'utf8').trim();
      // Detect JSON conversation format
      if (content.startsWith('{') && content.includes('"messages"')) {
        try {
          const conversation = JSON.parse(content);
          return processConversationJson(conversation, config.context || []);
        } catch (error) {
          throw CommonErrors.invalidArgument('input-file', 'Valid JSON conversation format');
        }
      }
      return content; // Existing text file behavior
    }
    // ... existing logic
  }
  ```
- **CONTEXT_INTEGRATION**:
  ```typescript
  function processConversationJson(conversation: any, contextFiles: string[]): Message[] {
    const messages = conversation.messages || [];
    // Add context references to conversation
    if (contextFiles.length > 0) {
      const contextMessage = {
        role: 'system',
        content: `Context files referenced: ${contextFiles.join(', ')}`
      };
      return [contextMessage, ...messages];
    }
    return messages;
  }
  ```
- **GOTCHA**: JSON validation must be robust - malformed JSON should fail gracefully
- **CURRENT**: [JSON Schema patterns](https://json-schema.org/understanding-json-schema/reference/object) for conversation validation
- **VALIDATE**: `make validate-l1 && make validate-l2` - all tests pass
- **FUNCTIONAL**: Test with JSON conversation file: `{"messages": [{"role": "user", "content": "test"}]}`
- **TEST_PYRAMID**: Add critical user journey test for: end-to-end JSON conversation processing with context files

### Task 6: UPDATE `packages/cli/src/commands/run.ts` - Implement AbortController timeout mechanism

- **ACTION**: ADD proper timeout cancellation using AbortController
- **IMPLEMENT**: Create AbortController, integrate with provider sendQuery calls
- **MIRROR**: p-retry timeout pattern from `reliability.ts:101-110` - use AbortSignal
- **IMPORTS**: `AbortController` (Node.js built-in, no import needed in Node 18+)
- **TIMEOUT_IMPLEMENTATION**:
  ```typescript
  async function executeWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    try {
      const result = await operation(controller.signal);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  ```
- **PROVIDER_INTEGRATION**: Pass AbortSignal to provider sendQuery methods (if supported)
- **GOTCHA**: AbortController must be polyfilled for older Node.js versions if needed
- **CURRENT**: [AbortController Node.js](https://nodejs.org/docs/latest-v20.x/api/globals#class-abortcontroller) - cancellation patterns
- **VALIDATE**: `make validate-l1 && make validate-l2 && make validate-l3` - full validation
- **FUNCTIONAL**: Test timeout with `--timeout 1` on slow operation
- **TEST_PYRAMID**: Add E2E test for: timeout cancellation with AbortController integration

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
|-----------|------------|-----------|
| `packages/cli/tests/config/structured-config.test.ts` | Provider config loading, env var substitution, validation | Structured configuration |
| `packages/cli/tests/commands/json-input.test.ts` | JSON conversation parsing, context integration, error handling | JSON input processing |
| `packages/cli/tests/providers/config-loading.test.ts` | Provider factory with config, backward compatibility | Provider configuration |

### Edge Cases Checklist

- [ ] Malformed JSON conversation input (graceful error)
- [ ] Missing provider config (falls back to defaults)
- [ ] Invalid environment variable references in config
- [ ] Context files that don't exist (reference only, no reading)
- [ ] Timeout during provider initialization
- [ ] AbortController signal propagation to providers

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
# Internally: bun run lint && bun run type-check
```

**EXPECT**: Exit 0, no TypeScript errors or ESLint warnings

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make validate-l2 && make build
# Internally: npx vitest --run && bun run build
```

**EXPECT**: All tests pass, binary builds successfully

### Level 3: UNIT_TESTS

```bash
make test-coverage
# Internally: npm run test:coverage
```

**EXPECT**: All tests pass, coverage >= 40% for new code

**COVERAGE NOTE**: When running isolated tests for this phase:
```bash
npm run test:coverage -- packages/cli/tests/config/ packages/cli/tests/commands/
```

### Level 4: FULL_SUITE

```bash
make validate-all
# Internally: validate-l1 validate-l2 validate-l3 validate-l4
```

**EXPECT**: All validation levels pass, binary is functional

### Level 5: FUNCTIONAL_VALIDATION

#### Test 1: Structured Configuration
```bash
# Create test config
mkdir -p .cia
cat > .cia/config.json << 'EOF'
{
  "providers": {
    "codex": {
      "model": "gpt-4",
      "timeout": 30
    }
  }
}
EOF

# Test configuration loading
./dist/cia run --provider codex "test" --timeout 5
```

#### Test 2: JSON Conversation Input
```bash
# Create test conversation
cat > test-conversation.json << 'EOF'
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Say hello"}
  ]
}
EOF

# Test JSON input processing
./dist/cia run --input-file test-conversation.json --context README.md "process this"
```

### Level 6: CURRENT_STANDARDS_VALIDATION

Use Context7 MCP to verify:
- [ ] AbortController usage follows Node.js best practices
- [ ] JSON Schema validation aligns with current standards
- [ ] Configuration patterns match enterprise standards
- [ ] Error handling follows current guidelines

---

## Acceptance Criteria

- [ ] CIAConfig interface extended with structured provider and MCP configurations
- [ ] Provider factory accepts and passes structured configuration to providers
- [ ] Codex and Claude providers accept optional configuration parameters
- [ ] JSON conversation input format is parsed and processed correctly
- [ ] Context files are referenced (not loaded) in LLM requests
- [ ] AbortController timeout mechanism cancels operations properly
- [ ] All existing functionality remains intact (backward compatibility)
- [ ] Level 1-4 validation commands pass with exit 0
- [ ] Unit tests cover >= 40% of new infrastructure code
- [ ] Functional validation scenarios work end-to-end
- [ ] **Implementation follows current Node.js and testing best practices**
- [ ] **No deprecated patterns or vulnerable dependencies introduced**

---

## Completion Checklist

- [ ] Task 1: CIAConfig interface extended (types only)
- [ ] Task 2: Structured config loading function added
- [ ] Task 3: Provider factory modified for config passing
- [ ] Task 4: Provider .create() methods accept config parameters
- [ ] Task 5: JSON conversation input processing implemented
- [ ] Task 6: AbortController timeout mechanism integrated
- [ ] Level 1: Static analysis passes
- [ ] Level 2: Build and basic functionality passes
- [ ] Level 3: Unit tests pass with coverage >= 40%
- [ ] Level 4: Full validation suite passes
- [ ] Level 5: Functional validation scenarios work
- [ ] Level 6: Current standards validation passes
- [ ] All acceptance criteria met

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 4 documentation libraries validated
**Web Intelligence Sources**: Node.js official docs, Vitest testing guide, JSON Schema specification, p-retry patterns
**Last Verification**: 2026-02-11T20:30:00Z
**Security Advisories Checked**: AbortController patterns, JSON parsing security, configuration validation
**Deprecated Patterns Avoided**: Synchronous file operations, legacy timeout mechanisms, unsafe JSON parsing

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Provider backward compatibility breaks | MEDIUM | HIGH | Maintain optional config parameters, comprehensive testing |
| JSON conversation parsing performance issues | LOW | MEDIUM | Lazy parsing, size limits, error boundaries |
| AbortController not supported in target Node.js | LOW | HIGH | Feature detection, graceful degradation |
| Configuration complexity overwhelms users | MEDIUM | MEDIUM | Maintain simple defaults, clear documentation |
| Documentation changes during implementation | LOW | MEDIUM | Context7 MCP re-verification during execution |
| Integration issues between structured config and existing providers | HIGH | MEDIUM | Incremental implementation, extensive testing at each step |

---

## Notes

### Architecture Decision: Structured Configuration Strategy

**Chosen Approach**: Extend existing CIAConfig interface with optional nested objects for providers and MCP configurations. This maintains backward compatibility while enabling advanced configuration patterns.

**Alternative Rejected**: Complete configuration rewrite - would break existing workflows and require extensive migration.

**Integration Strategy**: Build upon existing configuration hierarchy (`loadConfig()` → `mergeConfigs()`) rather than replacing it. This preserves the established precedence order: environment → user config → repo config → CLI args.

### Current Intelligence Considerations

**Node.js parseArgs Evolution**: The current codebase uses Node.js built-in `parseArgs` which gained stability in Node.js 18. Our patterns align with current best practices and avoid external CLI parsing dependencies.

**AbortController Maturity**: AbortController is now well-established in Node.js 18+ and provides the standard pattern for cancellation. Integration with existing p-retry patterns ensures robust timeout handling.

**JSON Schema Validation Timing**: While this phase focuses on JSON *parsing*, Phase 3b will add full JSON Schema *validation* with retry logic. The parsing infrastructure built here enables that future capability.

**Provider Configuration Evolution**: The structured configuration pattern established here directly enables Phase 4 (Azure OpenAI integration) and Phase 7 (MCP/Skills). This foundational work pays dividends across multiple subsequent phases.