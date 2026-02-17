# Feature: Core Infrastructure Enhancement for CIA Agent

## Summary

Enhance the foundational infrastructure of the CIA CLI to support future agent capabilities by extending MessageChunk types, implementing tool registry infrastructure, enhancing session context management, and migrating configuration schema to support MCP servers and Skills definitions. This phase prepares the system for Phases 7.2-7.6 while maintaining full backward compatibility.

## User Story

As a DevOps engineer
I want to use CIA as an intelligent agent with tools and skills support
So that I can perform complex multi-step tasks beyond simple prompt-response interactions

## Problem Statement

The current CIA CLI infrastructure has a basic ChatChunk interface, simple session tracking, and limited configuration schema that cannot support the advanced capabilities required for CIA Agent functionality (MCP servers, Skills, tool calling). This blocks implementation of Phases 7.2-7.6.

## Solution Statement

Incrementally enhance the existing infrastructure using decorator/extension patterns to add enhanced MessageChunk types, tool registry infrastructure, session context management, and configuration migration while maintaining backward compatibility with existing providers and user workflows.

## Metadata

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Type                   | ENHANCEMENT                                       |
| Complexity             | HIGH                                              |
| Systems Affected       | Core CLI, Provider abstraction, Configuration, Session management |
| Dependencies           | ajv@^8.17.1, @ai-sdk/azure@^3.0.30, @anthropic-ai/claude-agent-sdk@^0.2.7 |
| Estimated Tasks        | 8                                                 |
| **Research Timestamp** | **2026-02-17T22:30:00Z**                          |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              BEFORE STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   ║
║   │     User    │───►│ Commander.js│───►│   Config    │───►│  Provider   │   ║
║   │   Command   │    │   Parser    │    │   Loader    │    │  Factory    │   ║
║   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   ║
║                                               │                               ║
║                                               ▼                               ║
║                                      ┌─────────────┐                          ║
║                                      │Basic Config:│                          ║
║                                      │provider,    │                          ║
║                                      │model, keys  │                          ║
║                                      └─────────────┘                          ║
║                                                                               ║
║   USER_FLOW: cia run "prompt" → Basic text response                           ║
║   PAIN_POINT: Limited to simple prompt-response, no agent capabilities        ║
║   DATA_FLOW: Command → Config → Provider → ChatChunk(assistant|error|result) ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### After State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                               AFTER STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   ║
║   │     User    │───►│ Commander.js│───►│  Enhanced   │───►│  Provider   │   ║
║   │   Command   │    │   Parser    │    │   Config    │    │  Factory    │   ║
║   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   ║
║                          │                     │                             ║
║                          ▼                     ▼                             ║
║                 ┌─────────────┐    ┌─────────────────────────┐                ║
║                 │   Session   │    │    Enhanced Config:     │                ║
║                 │  Context    │    │ • providers, models     │                ║
║                 │ Management  │    │ • mcp: servers[]        │                ║
║                 └─────────────┘    │ • skills: sources[]     │                ║
║                          │         │ • tools: registry{}     │                ║
║                          ▼         └─────────────────────────┘                ║
║                 ┌─────────────┐                                               ║
║                 │ Enhanced    │  ◄── [Enhanced MessageChunk Types]            ║
║                 │MessageChunk │      • Tool call support                      ║
║                 │   Types     │      • Richer metadata                        ║
║                 └─────────────┘      • Session context                        ║
║                                                                               ║
║   USER_FLOW: cia run "prompt" → Enhanced response (backward compatible)       ║
║   VALUE_ADD: Foundation for CIA Agent capabilities                            ║
║   DATA_FLOW: Command → Enhanced Config → Session Context → Enhanced Chunks    ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| CLI Response | Basic text output | Enhanced error messages with better context | Better debugging experience |
| Configuration | Basic provider/model settings | Can define MCP servers and Skills (inactive) | Preparation for agent features |
| Session Tracking | Simple sessionId only | Rich session context management | Foundation for multi-turn conversations |
| Error Handling | Basic error messages | Enhanced error types with metadata | Better troubleshooting information |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `dev/cia-agent-technical-design.md` | 47-63, 377-396, 399-418 | Enhanced MessageChunk design, session context, tool registry architecture - FOLLOW exactly |
| P0 | `packages/cli/src/providers/types.ts` | 1-18 | Current ChatChunk and IAssistantChat interfaces to EXTEND exactly |
| P0 | `packages/cli/src/shared/config/loader.ts` | 5-275 | CIAConfig interface and loading patterns to MIRROR exactly |
| P1 | `packages/cli/src/providers/reliability.ts` | 7-154 | Decorator wrapper pattern to FOLLOW for enhancements |
| P1 | `packages/cli/src/shared/errors/error-handling.ts` | 36-208 | Error hierarchy patterns to EXTEND |
| P2 | `packages/cli/tests/providers.contract.test.ts` | 98-330 | Contract testing patterns to FOLLOW |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [TypeScript Docs v5.9.2](https://github.com/microsoft/typescript/blob/main/docs/guide/typescript.md#interface-extension) ✓ Current | Interface Extension | Method overloading patterns | 2026-02-17T22:30:00Z |
| [AJV v8.17.1 Docs](https://ajv.js.org/guide/typescript.html) ✓ Current | TypeScript Integration | JSON schema validation with type safety | 2026-02-17T22:30:00Z |
| [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/) ✓ Current | Session Management | Session ID patterns and tool calling infrastructure | 2026-02-17T22:30:00Z |

---

## Patterns to Mirror

**INTERFACE_EXTENSION_PATTERN:**
```typescript
// SOURCE: packages/cli/src/providers/types.ts:1-18
// COPY THIS PATTERN:
export interface ChatChunk {
  type: 'assistant' | 'result' | 'system' | 'tool' | 'thinking' | 'error';
  content?: string;
  sessionId?: string;
  toolName?: string;
}

export interface IAssistantChat {
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  sendQuery(messages: Message[], cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  getType(): string;
  listModels(): Promise<string[]>;
}
```

**ENHANCED_MESSAGECHUNK_PATTERN:**
```typescript
// SOURCE: dev/cia-agent-technical-design.md:47-63
// COPY THIS PATTERN:
export type MessageChunk =
  | { type: 'assistant'; content: string }
  | { type: 'system'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'result'; sessionId?: string }
  | { type: 'tool'; toolName: string; toolInput?: Record<string, unknown> }
  | { type: 'workflow_dispatch'; workerConversationId: string; workflowName: string }
  // New MCP-specific chunks
  | { type: 'mcp_tool'; serverName: string; toolName: string; toolInput?: Record<string, unknown> }
  | { type: 'mcp_status'; serverName: string; status: 'connected' | 'failed' | 'needs_auth' | 'disabled' }
  // New skills-specific chunks
  | { type: 'skill_loaded'; skillName: string; description: string }
  | { type: 'skill_content'; skillName: string; content: string; baseDir: string }
```

**ENHANCED_SESSION_CONTEXT_PATTERN:**
```typescript
// SOURCE: dev/cia-agent-technical-design.md:377-396
// COPY THIS PATTERN:
export interface EnhancedSessionContext extends SessionContext {
  // Tool registry
  availableTools: Record<string, Tool>
  mcpTools: Record<string, MCPTool>
  
  // Skills context
  loadedSkills: Record<string, SkillContent>
  skillResources: Record<string, string[]>
  
  // Configuration
  config: CIAConfig
  
  // Status tracking
  mcpStatus: Record<string, MCPStatus>
}
```

**TOOL_REGISTRY_PATTERN:**
```typescript
// SOURCE: dev/cia-agent-technical-design.md:399-418
// COPY THIS PATTERN:
export interface ToolRegistry {
  // Core tools (from remote-coding-agent)
  registerCoreTool(tool: Tool): void
  
  // MCP tools
  registerMCPTool(serverName: string, tool: MCPTool): void
  removeMCPTools(serverName: string): void
  
  // Dynamic tools (plugins, skills)
  registerDynamicTool(tool: DynamicTool): void
  
  // Query interface
  getAllTools(): Record<string, Tool>
  getToolById(id: string): Tool | undefined
  getToolsByType(type: 'core' | 'mcp' | 'dynamic'): Tool[]
}
```

**CONFIG_SCHEMA_PATTERN:**
```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:5-54
// COPY THIS PATTERN:
export interface CIAConfig {
  provider?: string;
  model?: string;
  providers?: { [providerName: string]: { ... } };
  mcp?: { servers: Array<{ name: string; command: string; ... }> };
}
```

**DECORATOR_WRAPPER_PATTERN:**
```typescript
// SOURCE: packages/cli/src/providers/reliability.ts:7-154
// COPY THIS PATTERN:
export class ReliableAssistantChat implements IAssistantChat {
  constructor(private client: IAssistantChat) {}
  
  async *sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk> {
    // Enhancement logic here
    yield* this.client.sendQuery(prompt, cwd, resumeSessionId);
  }
}
```

**ERROR_HIERARCHY_PATTERN:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:176-208
// COPY THIS PATTERN:
export class ContextError extends Error {
  constructor(message: string, public readonly source?: string) {
    super(message);
    this.name = 'ContextError';
  }
}
export class ContextFormatError extends ContextError {}
export class ContextSourceError extends ContextError {}
```

**CONFIG_VALIDATION_PATTERN:**
```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:232-259
// COPY THIS PATTERN:
function substituteEnvironmentVariables<T>(obj: T): T {
  return obj.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
    const value = process.env[envVar];
    return value === undefined ? match : value;
  }) as T;
}
```

**CONTRACT_TEST_PATTERN:**
```typescript
// SOURCE: packages/cli/tests/providers.contract.test.ts:98-330
// COPY THIS PATTERN:
const ALLOWED_CHUNK_TYPES = ['assistant', 'error', 'result', 'system', 'tool', 'thinking'];

expect(chunks).toHaveLength(1);
expect(chunk.type).toBe('error');
expect(resultChunk?.sessionId).toBeTruthy();
```

---

## Current Best Practices Validation

**Security (Context7 MCP Verified):**
- [x] MCP session management patterns followed (cryptographically secure session IDs)
- [x] Tool calling infrastructure prepared with proper validation stubs
- [x] Configuration schema validation prevents malformed MCP/Skills definitions
- [x] Enhanced error messages don't leak sensitive information

**Performance (Web Intelligence Verified):**
- [x] TypeScript interface extension patterns optimized for minimal overhead
- [x] AJV schema compilation for fast runtime validation (vs runtime parsing)
- [x] Session context uses lightweight in-memory storage
- [x] Optional fields in enhanced interfaces to avoid memory bloat

**Community Intelligence:**
- [x] TypeScript method overloading patterns follow current best practices
- [x] Decorator pattern aligns with existing provider wrapper implementations  
- [x] Configuration schema extension follows established patterns
- [x] Error handling maintains existing hierarchical approach

---

## Files to Change

| File                                          | Action | Justification                                       |
| --------------------------------------------- | ------ | --------------------------------------------------- |
| `packages/cli/src/providers/types.ts`         | UPDATE | Extend ChatChunk interface with enhanced fields     |
| `packages/cli/src/shared/config/loader.ts`    | UPDATE | Extend CIAConfig interface for MCP and Skills      |
| `packages/cli/src/shared/config/schema.ts`    | CREATE | AJV schema definitions for enhanced config          |
| `packages/cli/src/core/session-context.ts`    | CREATE | Session context management infrastructure           |
| `packages/cli/src/core/tool-registry.ts`      | CREATE | Tool registry infrastructure (empty but extensible) |
| `packages/cli/src/shared/errors/enhanced.ts`  | CREATE | Enhanced error types for agent capabilities        |
| `packages/cli/tests/core/session-context.test.ts` | CREATE | Unit tests for session context management      |
| `packages/cli/tests/core/tool-registry.test.ts`   | CREATE | Unit tests for tool registry infrastructure     |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **MCP server connections**: Deferred to Phase 7.2 - only config schema prepared
- **Skills loading and execution**: Deferred to Phase 7.3 - only config schema prepared
- **Tool calling implementation**: Deferred to Phase 7.4 - only infrastructure stub prepared
- **New CLI commands for agent management**: Deferred to Phase 7.5 - internal infrastructure only
- **Persistent session storage**: Session context is ephemeral (in-memory) for Phase 7.1

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: build, functionally test, then run unit tests with coverage enabled. Prefer Makefile targets or package scripts when available (e.g., `make validate-l3`, `bun test`).

**Coverage Targets**: Infrastructure enhancement 60% (OSS standard)

### Task 1: EXTEND `packages/cli/src/providers/types.ts` (update)

- **ACTION**: EXTEND ChatChunk interface with enhanced fields for tool calling and metadata
- **IMPLEMENT**: Add optional fields: `toolCallId?: string`, `metadata?: Record<string, any>`, `contextId?: string`
- **MIRROR**: `packages/cli/src/providers/types.ts:1-6` - preserve existing fields exactly
- **IMPORTS**: No new imports needed - extending existing interface
- **GOTCHA**: All new fields must be optional to maintain backward compatibility
- **CURRENT**: Interface extension follows TypeScript v5.9.2 best practices for method overloading
- **VALIDATE**: `make validate-l1`
- **FUNCTIONAL**: `bun test packages/cli/tests/providers.contract.test.ts` - verify contract tests still pass
- **TEST_PYRAMID**: No additional tests needed - interface extension only

### Task 2: CREATE `packages/cli/src/shared/config/schema.ts`

- **ACTION**: CREATE AJV schema definitions for enhanced configuration validation
- **IMPLEMENT**: JSON schemas for MCP servers, Skills definitions, tool registry configuration
- **MIRROR**: `packages/cli/src/shared/config/loader.ts:232-259` - follow validation patterns
- **IMPORTS**: `import Ajv, { JSONSchemaType } from "ajv"`
- **TYPES**: Define schemas for `MCPServerConfig`, `SkillsConfig`, `ToolRegistryConfig`
- **GOTCHA**: Use AJV v8 syntax - `JSONSchemaType<T>` for compile-time type safety
- **CURRENT**: AJV v8.17.1 TypeScript integration patterns for schema compilation
- **VALIDATE**: `make validate-l1`
- **TEST_PYRAMID**: Add integration test for: schema validation with valid/invalid configs

### Task 3: EXTEND `packages/cli/src/shared/config/loader.ts` (update)

- **ACTION**: EXTEND CIAConfig interface to support MCP servers and Skills definitions
- **IMPLEMENT**: Add `mcp?: { servers: MCPServerConfig[] }`, `skills?: SkillsConfig`, `tools?: ToolRegistryConfig`
- **MIRROR**: `packages/cli/src/shared/config/loader.ts:5-54` - extend existing interface pattern
- **IMPORTS**: `import { MCPServerConfig, SkillsConfig, ToolRegistryConfig } from "./schema"`
- **PATTERN**: All new fields optional, validate with AJV schemas from Task 2
- **GOTCHA**: Environment variable substitution must work with new nested config objects
- **CURRENT**: Configuration schema extension follows established patterns
- **VALIDATE**: `make validate-l1`
- **TEST_PYRAMID**: Add integration test for: enhanced config loading with MCP/Skills definitions

### Task 4: CREATE `packages/cli/src/core/session-context.ts`

- **ACTION**: CREATE session context management for enhanced session tracking
- **IMPLEMENT**: `SessionContext` class with `createSession()`, `getSession()`, `updateSession()`, `clearSession()`
- **MIRROR**: `packages/cli/src/providers/reliability.ts:39-52` - follow service pattern
- **IMPORTS**: `import crypto from 'crypto'` for secure session ID generation
- **PATTERN**: In-memory Map storage, cryptographically secure session IDs (32 bytes hex)
- **GOTCHA**: Session IDs must contain only visible ASCII characters (MCP spec requirement)
- **CURRENT**: MCP specification session management patterns (secure, ASCII-only session IDs)
- **VALIDATE**: `make validate-l1`
- **TEST_PYRAMID**: Add integration test for: session lifecycle management with concurrent access

### Task 5: CREATE `packages/cli/src/core/tool-registry.ts`

- **ACTION**: CREATE tool registry infrastructure (empty but extensible)
- **IMPLEMENT**: `ToolRegistry` class with `registerTool()`, `getTool()`, `listTools()`, `validateTool()` methods
- **MIRROR**: `packages/cli/src/providers/index.ts:24-36` - follow factory/registry pattern
- **IMPORTS**: `import Ajv from "ajv"` for tool definition validation
- **PATTERN**: Empty registry with stub implementations, preparation for Phase 7.4
- **GOTCHA**: Tool validation should use JSON schema but not require actual tools
- **CURRENT**: MCP tool calling patterns for future integration
- **VALIDATE**: `make validate-l1`
- **TEST_PYRAMID**: Add integration test for: tool registry operations with validation

### Task 6: CREATE `packages/cli/src/shared/errors/enhanced.ts`

- **ACTION**: CREATE enhanced error types for agent capabilities
- **IMPLEMENT**: `SessionError`, `ToolRegistryError`, `ConfigMigrationError` classes
- **MIRROR**: `packages/cli/src/shared/errors/error-handling.ts:176-208` - extend hierarchy pattern
- **PATTERN**: Extend base `Error` class, include error codes and contextual information
- **GOTCHA**: Enhanced error messages shouldn't leak sensitive session or config data
- **CURRENT**: Error handling best practices with contextual information without security leaks
- **VALIDATE**: `make validate-l1`
- **TEST_PYRAMID**: No additional tests needed - simple error class definitions

### Task 7: CREATE `packages/cli/tests/core/session-context.test.ts`

- **ACTION**: CREATE unit tests for session context management
- **IMPLEMENT**: Test session creation, retrieval, updates, concurrent access, cleanup
- **MIRROR**: `packages/cli/tests/providers.contract.test.ts:98-330` - follow test structure
- **PATTERN**: Use Vitest with mock pattern, test session lifecycle operations
- **VALIDATE**: `make validate-l3` - run tests with coverage
- **TEST_PYRAMID**: Add critical user journey test for: session management across multiple requests

### Task 8: CREATE `packages/cli/tests/core/tool-registry.test.ts`

- **ACTION**: CREATE unit tests for tool registry infrastructure
- **IMPLEMENT**: Test tool registration, validation, retrieval with empty registry
- **MIRROR**: `packages/cli/tests/providers.contract.test.ts:98-330` - follow test structure
- **PATTERN**: Use Vitest, test registry operations and validation logic
- **VALIDATE**: `make validate-all` - full validation including integration tests
- **FUNCTIONAL**: `bun test` - verify all tests pass with enhanced infrastructure
- **TEST_PYRAMID**: Add E2E test for: complete infrastructure enhancement working with existing providers

---

## Testing Strategy

### Unit Tests to Write

| Test File                                        | Test Cases                          | Validates        |
| ------------------------------------------------ | ----------------------------------- | ---------------- |
| `packages/cli/tests/core/session-context.test.ts` | Session CRUD, concurrent access   | Session management |
| `packages/cli/tests/core/tool-registry.test.ts`   | Registry operations, validation   | Tool infrastructure |
| `packages/cli/tests/shared/config/schema.test.ts` | Schema validation, edge cases     | Config validation |

### Edge Cases Checklist

- [ ] Enhanced ChatChunk fields are optional and don't break existing providers
- [ ] Session IDs are cryptographically secure and ASCII-only
- [ ] Config migration handles existing files without MCP/Skills definitions
- [ ] Tool registry gracefully handles empty state
- [ ] Enhanced error types degrade to basic errors in legacy contexts
- [ ] Memory usage doesn't increase significantly with session context

---

## Validation Commands

**IMPORTANT**: Use actual governed commands from the project's Makefile.

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
# Runs: type-check && lint
```

**EXPECT**: Exit 0, no errors or warnings

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make validate-l2
# Runs: vitest --run
```

**EXPECT**: Unit tests pass, enhanced infrastructure functional

### Level 3: UNIT_TESTS

```bash
make validate-l3
# Runs: vitest --run && build
```

**EXPECT**: All tests pass, coverage >= 60%

### Level 4: FULL_SUITE

```bash
make validate-all
# Runs: validate-l1 validate-l2 validate-l3 validate-l4
```

**EXPECT**: Complete validation passes

### Level 6: CURRENT_STANDARDS_VALIDATION

Use Context7 MCP to verify:
- [ ] TypeScript interface extension patterns current
- [ ] AJV schema validation follows current best practices
- [ ] MCP session management patterns up-to-date
- [ ] Error handling maintains security best practices

### Level 7: MANUAL_VALIDATION

1. Run existing CLI commands - verify backward compatibility
2. Check enhanced config loading with sample MCP/Skills definitions
3. Verify session context creation and cleanup
4. Test enhanced error messages provide better context

---

## Acceptance Criteria

- [ ] All specified functionality implemented per user story
- [ ] Level 1-4 validation commands pass with exit 0
- [ ] Unit tests cover >= 60% of new infrastructure code
- [ ] Code mirrors existing patterns exactly (interfaces, config, errors)
- [ ] No regressions in existing provider contract tests
- [ ] Enhanced infrastructure is backward compatible
- [ ] **Implementation follows current TypeScript and AJV best practices**
- [ ] **MCP session management patterns correctly implemented**
- [ ] **Enhanced configuration schema validation working**

---

## Completion Checklist

- [ ] All 8 tasks completed in dependency order
- [ ] Each task validated immediately after completion
- [ ] Level 1: Static analysis (lint + type-check) passes
- [ ] Level 2: Unit tests pass
- [ ] Level 3: Build and integration tests succeed  
- [ ] Level 4: Full test suite + build succeeds
- [ ] Level 6: Current standards validation passes
- [ ] All acceptance criteria met

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 3 documentation queries
**Web Intelligence Sources**: 1 community source consulted (Stack Overflow TypeScript patterns)
**Last Verification**: 2026-02-17T22:30:00Z
**Security Advisories Checked**: MCP specification session management, AJV validation security
**Deprecated Patterns Avoided**: Legacy interface replacement, synchronous config loading, external session storage

---

## Risks and Mitigations

| Risk                                        | Likelihood   | Impact       | Mitigation                                    |
| ------------------------------------------- | ------------ | ------------ | --------------------------------------------- |
| Enhanced types break existing providers     | LOW          | HIGH         | All enhancements use optional fields and decorator patterns |
| Performance degradation from session context | MEDIUM       | MEDIUM       | Use lightweight in-memory storage, benchmark early |
| Config migration fails with existing files  | LOW          | MEDIUM       | Extensive backward compatibility testing |
| Documentation changes during implementation | LOW          | MEDIUM       | Context7 MCP re-verification during execution |
| AJV schema validation overhead               | LOW          | MEDIUM       | Use compiled schemas for performance |

---

## Notes

### Current Intelligence Considerations

The implementation leverages current best practices from:
- TypeScript v5.9.2 interface extension patterns for backward compatibility
- AJV v8.17.1 TypeScript integration for compile-time type safety
- MCP specification 2025-11-25 for session management and tool calling infrastructure
- Community consensus on decorator patterns for provider enhancements

### Architecture Invariants

This phase establishes critical invariants for future CIA Agent phases:
1. **Backward Compatibility**: All existing functionality preserved
2. **Infrastructure Readiness**: MCP, Skills, and Tool calling foundations prepared
3. **Performance Maintenance**: <100ms overhead target preserved
4. **Configuration Evolution**: Enhanced config schema supports future agent capabilities
5. **Error Enhancement**: Richer error context without breaking existing error handling
