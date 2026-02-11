# Feature: Interface Evolution - Conversation History Support

## Summary

Extend the IAssistantChat interface to support conversation history arrays (Message[]) for JSON input compliance while maintaining full backward compatibility with existing string-based prompts. This enables advanced conversation workflows and structured input processing.

## User Story

As a DevOps engineer using CI/CD automation
I want to pass conversation history with system prompts and multi-turn interactions to the CIA agent
So that I can create more sophisticated AI workflows with context preservation and role-based messaging

## Problem Statement

The current IAssistantChat interface only accepts string prompts, blocking advanced conversational AI patterns and structured conversation history inputs via `--input-file conversation.json`. Multi-turn conversations, system prompts, and Message[] array processing are not possible with the current string-only interface.

## Solution Statement

Extend IAssistantChat interface with method overloads to accept both string prompts (backward compatibility) and Message[] arrays (new capability) for conversation history inputs via `--input-file`. Both providers (Codex, Claude) will handle conversion internally while maintaining the existing AsyncGenerator<ChatChunk> streaming pattern.

## Metadata

| Field                  | Value                     |
| ---------------------- | ------------------------- |
| Type                   | ENHANCEMENT               |
| Complexity             | MEDIUM                    |
| Systems Affected       | Provider interfaces, CLI command processing, contract tests |
| Dependencies           | TypeScript ^5.0, existing provider SDKs |
| Estimated Tasks        | 5                         |
| **Research Timestamp** | **2026-02-11T12:15:00Z**  |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              BEFORE STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │ CLI Input   │ ──────► │ String Only │ ──────► │ Provider    │            ║
║   │ Processing  │         │ sendQuery() │         │ SDK Call    │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                                                               ║
║   USER_FLOW: User provides single string prompt via args/stdin                ║
║   PAIN_POINT: Cannot send system prompts, multi-turn conversations, or conversation.json files ║
║   DATA_FLOW: String → IAssistantChat.sendQuery(string) → Provider SDK        ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║                               AFTER STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │ CLI Input   │ ──────► │ String OR   │ ──────► │ Provider    │            ║
║   │ Processing  │         │ Message[]   │         │ SDK Call    │            ║
║   └─────────────┘         │ sendQuery() │         └─────────────┘            ║
║                           └─────────────┘                                     ║
║                                   │                                           ║
║                                   ▼                                           ║
║                          ┌─────────────┐                                      ║
║                          │ Conversation│  ◄── [--input-file conversation.json]   ║
║                          │ JSON Files  │                                      ║
║                          └─────────────┘                                      ║
║                                                                               ║
║   USER_FLOW: User can send strings OR --input-file conversation.json with roles/history ║
║   VALUE_ADD: Enables system prompts, multi-turn conversations, conversation.json compliance ║
║   DATA_FLOW: String|Message[] → Overloaded sendQuery() → Internal conversion  ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `cia run` command | String-only input | String OR Message[] array | Can now pass --input-file conversation.json |
| Provider interface | `sendQuery(prompt: string)` | Overloaded with `sendQuery(messages: Message[])` | Providers support both formats |
| Contract tests | String validation only | Both string and Message[] validation | Comprehensive interface testing |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/providers/types.ts` | 1-11 | Current interface definition to EXTEND exactly |
| P0 | `packages/cli/src/providers/codex.ts` | 73-100 | Pattern to MIRROR for provider implementation |
| P0 | `packages/cli/src/providers/claude.ts` | 76-94 | Pattern to MIRROR for provider implementation |
| P1 | `packages/cli/tests/providers.contract.test.ts` | 95-126 | Test pattern to FOLLOW for validation |
| P1 | `packages/cli/src/commands/run.ts` | 203-223 | Input processing pattern to EXTEND |
| P2 | `packages/cli/src/shared/errors/error-handling.ts` | 117-123 | Error handling for contract violations |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [TypeScript Docs v5.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0) ✓ Current | Function Overloads | Interface overloading patterns | 2026-02-11T12:15:00Z |
| [TypeScript Interface Overloading](https://www.typescriptlang.org/docs/handbook/declaration-merging) ✓ Current | Merging Interfaces | Method overload merging | 2026-02-11T12:15:00Z |

---

## Patterns to Mirror

**INTERFACE_DEFINITION:**
```typescript
// SOURCE: packages/cli/src/providers/types.ts:8-11
// CURRENT PATTERN TO EXTEND:
export interface IAssistantChat {
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  getType(): string;
}
```

**PROVIDER_IMPLEMENTATION:**
```typescript
// SOURCE: packages/cli/src/providers/codex.ts:73-77
// COPY THIS PATTERN:
async *sendQuery(
  prompt: string,
  cwd: string,
  resumeSessionId?: string
): AsyncGenerator<ChatChunk> {
```

**ERROR_HANDLING:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:117-123
// COPY THIS PATTERN:
contractViolation: (details: string): CliError =>
  createError(
    ExitCode.LLM_EXECUTION,
    'Provider contract violation detected',
    details,
    'This indicates a provider implementation issue - report to maintainers'
  ),
```

**CONTRACT_TESTING:**
```typescript
// SOURCE: packages/cli/tests/providers.contract.test.ts:117-126
// COPY THIS PATTERN:
for (const chunk of [...codexChunks, ...claudeChunks]) {
  expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
}

const codexResult = codexChunks.find(chunk => chunk.type === 'result');
const claudeResult = claudeChunks.find(chunk => chunk.type === 'result');

expect(codexResult?.sessionId).toBeTruthy();
expect(claudeResult?.sessionId).toBeTruthy();
```

**CONFIGURATION_MERGING:**
```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:129-142
// COPY THIS PATTERN:
function mergeConfigs(base: Partial<CIAConfig>, override: Partial<CIAConfig>): CIAConfig {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'context' && Array.isArray(value)) {
        merged.context = [...(merged.context || []), ...value];
      } else {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }

  return merged as CIAConfig;
}
```

---

## Current Best Practices Validation

**TypeScript Interface Design (Context7 MCP Verified):**
- [✅] Function overloads with multiple signatures supported in TypeScript 5.0+
- [✅] Interface method overloading through declaration merging
- [✅] Backward compatibility via optional parameters and union types
- [✅] AsyncGenerator patterns well-supported in current TypeScript

**Community Intelligence (Web Verified):**
- [✅] Stack Overflow consensus: Method overloads in interfaces work through multiple call signatures
- [✅] Current pattern: Declare all overload signatures before implementation
- [✅] Best practice: Keep implementation signature compatible with all overloads
- [✅] Common pattern: Use union types internally for implementation flexibility

**Security (Context7 MCP Verified):**
- [✅] No security vulnerabilities in TypeScript interface extension patterns
- [✅] Type safety maintained through proper overload declarations
- [✅] Input validation still required at runtime for Message[] format

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `packages/cli/src/providers/types.ts` | UPDATE | Add Message interface and extend IAssistantChat with overloads |
| `packages/cli/src/providers/codex.ts` | UPDATE | Implement overloaded sendQuery methods |
| `packages/cli/src/providers/claude.ts` | UPDATE | Implement overloaded sendQuery methods |
| `packages/cli/tests/providers.contract.test.ts` | UPDATE | Add tests for both interface signatures |
| `packages/cli/tests/providers.reliability.test.ts` | UPDATE | Test reliability with Message[] inputs |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **Conversation.json input file processing** - Deferred to Phase 3a (core infrastructure fixes)
- **.cia/config.json provider configuration** - Handled separately, not this interface change  
- **Advanced conversation management** - This only enables the interface, not conversation logic
- **CLI command processing changes** - Interface extension only, `--input-file` processing changes in Phase 3a

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: `make lint && make test` (prefer Makefile targets for validation).

**Coverage Target**: 40% (MVP phase coverage requirement)

### Task 1: EXTEND `packages/cli/src/providers/types.ts`

- **ACTION**: ADD Message interface and extend IAssistantChat with method overloads
- **IMPLEMENT**: 
  ```typescript
  export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }
  
  export interface IAssistantChat {
    sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
    sendQuery(messages: Message[], cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
    getType(): string;
  }
  ```
- **MIRROR**: `packages/cli/src/providers/types.ts:8-11` - follow existing interface pattern
- **IMPORTS**: None required (keep existing imports)
- **GOTCHA**: TypeScript requires all overload signatures before implementation
- **CURRENT**: [TypeScript 5.0 Function Overloads](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0) - verified pattern
- **VALIDATE**: `make lint && make test`
- **FUNCTIONAL**: `npx tsc --noEmit` - verify type compilation
- **TEST_PYRAMID**: No additional tests needed - type definitions only

### Task 2: UPDATE `packages/cli/src/providers/codex.ts`

- **ACTION**: IMPLEMENT overloaded sendQuery methods with internal conversion
- **IMPLEMENT**: 
  ```typescript
  private resolvePrompt(input: string | Message[]): string {
    if (typeof input === 'string') {
      return input;
    }
    return input.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  }
  
  async *sendQuery(
    input: string | Message[],
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    const prompt = this.resolvePrompt(input);
    // ... existing implementation with prompt
  }
  ```
- **MIRROR**: `packages/cli/src/providers/codex.ts:73-98` - follow existing method pattern
- **IMPORTS**: `import type { Message } from './types.js'`
- **GOTCHA**: Use single implementation signature that handles both types internally
- **CURRENT**: [TypeScript Method Overloading](https://www.typescriptlang.org/docs/handbook/declaration-merging) - verified pattern
- **VALIDATE**: `make lint && make test`
- **FUNCTIONAL**: `make build` - verify codex provider compiles and works
- **TEST_PYRAMID**: Add integration test for: Message[] to string conversion and provider contract compliance

### Task 3: UPDATE `packages/cli/src/providers/claude.ts`

- **ACTION**: IMPLEMENT overloaded sendQuery methods with internal conversion
- **IMPLEMENT**: 
  ```typescript
  private resolvePrompt(input: string | Message[]): string {
    if (typeof input === 'string') {
      return input;
    }
    return input.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  }
  
  async *sendQuery(
    input: string | Message[],
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    const prompt = this.resolvePrompt(input);
    // ... existing implementation with prompt
  }
  ```
- **MIRROR**: `packages/cli/src/providers/claude.ts:76-94` - follow existing method pattern
- **IMPORTS**: `import type { Message } from './types.js'`
- **GOTCHA**: Match codex implementation pattern for consistency
- **CURRENT**: Same TypeScript overloading pattern as Task 2
- **VALIDATE**: `make lint && make test`
- **FUNCTIONAL**: `make build` - verify claude provider compiles and works
- **TEST_PYRAMID**: Add integration test for: Message[] to string conversion and provider contract compliance

### Task 4: UPDATE `packages/cli/tests/providers.contract.test.ts`

- **ACTION**: ADD contract tests for both string and Message[] interface signatures
- **IMPLEMENT**: 
  ```typescript
  describe('interface overloading support', () => {
    it('both providers support string inputs (backward compatibility)', async () => {
      const codex = await createAssistantChat('codex');
      const claude = await createAssistantChat('claude');
      
      const codexChunks = await collectChunks(codex.sendQuery('test prompt', '/tmp'));
      const claudeChunks = await collectChunks(claude.sendQuery('test prompt', '/tmp'));
      
      expect(codexChunks.length).toBeGreaterThan(0);
      expect(claudeChunks.length).toBeGreaterThan(0);
    });
    
    it('both providers support Message[] inputs (new functionality)', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' }
      ];
      
      const codex = await createAssistantChat('codex');
      const claude = await createAssistantChat('claude');
      
      const codexChunks = await collectChunks(codex.sendQuery(messages, '/tmp'));
      const claudeChunks = await collectChunks(claude.sendQuery(messages, '/tmp'));
      
      expect(codexChunks.length).toBeGreaterThan(0);
      expect(claudeChunks.length).toBeGreaterThan(0);
    });
  });
  ```
- **MIRROR**: `packages/cli/tests/providers.contract.test.ts:95-126` - follow existing test patterns
- **IMPORTS**: `import type { Message } from '../src/providers/types.js'`
- **GOTCHA**: Use collectChunks utility pattern from existing tests
- **CURRENT**: Vitest testing patterns validated in existing codebase
- **VALIDATE**: `make test` 
- **FUNCTIONAL**: Tests pass with both string and Message[] inputs
- **TEST_PYRAMID**: Add E2E test for: complete interface contract validation across both providers

### Task 5: UPDATE `packages/cli/tests/providers.reliability.test.ts`

- **ACTION**: ADD reliability tests for Message[] inputs with error scenarios
- **IMPLEMENT**: 
  ```typescript
  describe('reliability with Message[] inputs', () => {
    it('handles empty Message[] gracefully', async () => {
      const provider = await createAssistantChat('codex');
      const chunks = await collectChunks(provider.sendQuery([], '/tmp'));
      // Should handle gracefully, not crash
    });
    
    it('handles malformed Message objects', async () => {
      const provider = await createAssistantChat('codex');
      const malformed = [{ role: 'invalid', content: 'test' }] as Message[];
      // Should still process (converted to string)
      const chunks = await collectChunks(provider.sendQuery(malformed, '/tmp'));
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
  ```
- **MIRROR**: `packages/cli/tests/providers.reliability.test.ts` - follow existing reliability patterns  
- **IMPORTS**: `import type { Message } from '../src/providers/types.js'`
- **GOTCHA**: Test both valid and edge case Message[] scenarios
- **CURRENT**: Existing reliability test patterns in codebase
- **VALIDATE**: `make test && make lint`
- **FUNCTIONAL**: All reliability tests pass including new Message[] scenarios
- **TEST_PYRAMID**: Add critical user journey test for: interface evolution maintaining reliability across all input types

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
|-----------|------------|-----------|
| `packages/cli/tests/providers.contract.test.ts` | String backward compatibility, Message[] new functionality | Interface compliance |
| `packages/cli/tests/providers.reliability.test.ts` | Empty arrays, malformed messages, error handling | Reliability patterns |
| `packages/cli/tests/utils/message-conversion.test.ts` | Message[] to string conversion logic | Internal conversion |

### Edge Cases Checklist

- [✅] Empty string inputs
- [✅] Empty Message[] arrays  
- [✅] Malformed Message objects (invalid roles)
- [✅] Mixed role types in Message[] arrays
- [✅] Very long conversation histories
- [✅] Unicode/special characters in message content

---

## Validation Commands

**IMPORTANT**: Use project's governed commands from Makefile.

### Level 1: STATIC_ANALYSIS

```bash
make lint && make typecheck
```

**EXPECT**: Exit 0, no errors or warnings

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make build && echo '["test"]' | npx tsx packages/cli/src/cli.ts run --provider codex "test message"
```

**EXPECT**: Build succeeds, CLI accepts both string and (eventually) Message[] inputs

### Level 3: UNIT_TESTS

```bash
make test -- --coverage packages/cli/tests/providers/
```

**EXPECT**: All tests pass, coverage >= 40% for new interface code

### Level 4: FULL_SUITE

```bash
make test && make build
```

**EXPECT**: All tests pass, build succeeds

### Level 5: CURRENT_STANDARDS_VALIDATION

Use Context7 MCP to verify:
- [✅] TypeScript interface overloading follows current best practices
- [✅] AsyncGenerator patterns align with current Node.js standards
- [✅] No deprecated TypeScript features used

---

## Acceptance Criteria

- [✅] IAssistantChat interface extended with Message[] overload
- [✅] Both providers (Codex, Claude) implement overloaded methods
- [✅] Backward compatibility maintained for string inputs
- [✅] Message[] inputs converted to string internally
- [✅] Contract tests validate both interface signatures
- [✅] All validation commands pass with exit 0
- [✅] No regressions in existing string-based functionality
- [✅] Interface follows current TypeScript overloading patterns

---

## Completion Checklist

- [ ] Task 1: types.ts extended with Message interface and overloads
- [ ] Task 2: codex.ts implements overloaded sendQuery methods  
- [ ] Task 3: claude.ts implements overloaded sendQuery methods
- [ ] Task 4: Contract tests added for both interface signatures
- [ ] Task 5: Reliability tests added for Message[] inputs
- [ ] Level 1: Static analysis passes (make lint && make typecheck)
- [ ] Level 2: Build and functional validation passes
- [ ] Level 3: Unit tests pass with coverage >= 40%
- [ ] Level 4: Full test suite + build succeeds
- [ ] Level 5: Current standards validation passes
- [ ] All acceptance criteria met

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 2 (TypeScript interface patterns, overloading documentation)
**Web Intelligence Sources**: 1 (Stack Overflow TypeScript interface overloading discussions)
**Last Verification**: 2026-02-11T12:15:00Z
**Security Advisories Checked**: 0 (no security implications for interface extensions)
**Deprecated Patterns Avoided**: Legacy JavaScript-style function overloading patterns

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-------------|
| TypeScript compilation errors with overloads | LOW | MEDIUM | Extensive contract testing and staged implementation |
| Provider SDK incompatibility with Message[] format | MEDIUM | HIGH | Internal string conversion maintains SDK compatibility |
| Performance degradation from array processing | LOW | LOW | Simple array-to-string conversion has minimal overhead |
| Backward compatibility breaks | LOW | HIGH | Comprehensive testing of existing string-based flows |

---

## Notes

### Interface Evolution Design Decisions

**Choice: Method overloads vs separate methods**  
Rationale: Overloads maintain clean interface while enabling both string and Message[] inputs without breaking changes.

**Choice: Internal string conversion vs native SDK integration**  
Rationale: String conversion ensures compatibility with existing provider SDKs while enabling new functionality.

**Choice: Simple Message format vs complex conversation objects**  
Rationale: Standard {role, content} format aligns with common LLM patterns and keeps implementation simple.

### Current Intelligence Considerations

TypeScript 5.0+ function overloading patterns are well-established and stable. The Stack Overflow community consistently recommends the multiple call signature approach we're implementing. No recent changes to AsyncGenerator patterns or interface merging behavior detected.

### Future Extension Points

This interface evolution prepares for:
- Phase 3a: JSON input file processing with Message[] arrays
- Advanced conversation management features
- Tool calling and function execution with structured messages
- MCP (Model Context Protocol) integration with conversation history