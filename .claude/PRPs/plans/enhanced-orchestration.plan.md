# Feature: MCP and Skills Integration

## Summary

Ensure MCP tools and Skills work together seamlessly in the existing command flow by improving coordination between the components that are already implemented. This focuses on enhancing the existing run command to surface MCP tool availability and ensure Skills and MCP tools can work together in AI workflows.

## User Story

As a DevOps engineer using the CIA CLI tool
I want to see what MCP tools and Skills are available when I run queries
So that I can understand and leverage the full capabilities of my AI workflows

## Problem Statement

MCP integration (Phase 7.2) and Skills system (Phase 7.3) exist as separate components, but users have limited visibility into what capabilities are available. The systems work independently but don't provide clear status information or coordinate when both are present in a workflow.

## Solution Statement

Enhance the existing command flow in `commands/run.ts` to surface MCP tool status and ensure Skills and MCP tools coordinate properly, without adding unnecessary orchestration layers. Use the existing MessageChunk system to provide visibility into available capabilities.

## Metadata

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Type                   | ENHANCEMENT                                       |
| Complexity             | LOW                                               |
| Systems Affected       | Commands, MessageChunk types                      |
| Dependencies           | vitest@^1.6.0, bun@>=1.0.0                      |
| Estimated Tasks        | 5                                                 |
| **Research Timestamp** | **2026-02-18T13:00:00Z**                         |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              BEFORE STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │     CLI     │ ──────► │   Provider  │ ──────► │     LLM     │            ║
║   │   Command   │         │   Factory   │         │  Response   │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                   │                                           ║
║                                   ▼                                           ║
║                          ┌─────────────┐                                      ║
║                          │ MCP + Skills│                                      ║
║                          │ (Available  │                                      ║
║                          │  but hidden)│                                      ║
║                          └─────────────┘                                      ║
║                                                                               ║
║   USER_FLOW: Query → Response (no visibility into available tools/skills)    ║
║   PAIN_POINT: Users don't know what capabilities are available               ║
║   DATA_FLOW: Prompt → Provider → LLM → Response (capabilities hidden)        ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║                               AFTER STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │     CLI     │ ──────► │   Provider  │ ──────► │     LLM     │            ║
║   │   Command   │         │   Factory   │         │  Response   │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║         │                         │                       │                  ║
║         ▼                         ▼                       ▼                  ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │   Status    │         │ MCP Tools   │         │ Tool Status │            ║
║   │  Messages   │         │  Available  │         │  in Stream  │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                                                               ║
║   USER_FLOW: Query → Status Info → Response (with tool availability)         ║
║   VALUE_ADD: Clear visibility into AI capabilities and tool status           ║
║   DATA_FLOW: Prompt → Enhanced Status → LLM → Tool-aware Response            ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `cia run` command | Silent capability loading | Status messages for tools/skills | User sees what capabilities are available |
| Streaming output | Only assistant/error chunks | Status chunks for tools/skills | Better understanding of AI capabilities |
| Error scenarios | Generic failure messages | Specific MCP/Skills status info | Easier troubleshooting |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/commands/run.ts` | 270-299 | Skills integration pattern already implemented |
| P0 | `packages/cli/src/providers/index.ts` | 22-37 | MCP initialization pattern already implemented |
| P1 | `packages/cli/src/providers/types.ts` | 2-32 | MessageChunk types to extend |
| P1 | `packages/cli/src/providers/mcp.ts` | 78-95 | MCP tool status methods |

---

## Patterns to Mirror

**STATUS_LOGGING_PATTERN:**
```typescript
// SOURCE: packages/cli/src/providers/index.ts:26-31
// COPY THIS PATTERN:
console.log('[Provider Factory] MCP provider initialized:', 
  `${healthInfo.connectedServers}/${healthInfo.serverCount} servers connected, 
   ${healthInfo.toolCount} tools available`);
```

**SKILLS_INTEGRATION_PATTERN:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:274-299
// COPY THIS PATTERN:
const skillsManager = new SkillsManager();
await skillsManager.initialize(config.skills || {});
const skill = skillsManager.getSkill(config.skill);
if (skill) {
  basePrompt = skillContent.trim() + (basePrompt ? `\n\n${basePrompt}` : '');
}
```

**ERROR_HANDLING_PATTERN:**
```typescript
// SOURCE: packages/cli/src/providers/index.ts:32-35
// COPY THIS PATTERN:
} catch (error) {
  console.error('[Provider Factory] MCP provider initialization failed:', error);
  // Continue without MCP - non-blocking
}
```

---

## Files to Change

| File                                          | Action | Justification                                    |
| --------------------------------------------- | ------ | ------------------------------------------------ |
| `packages/cli/src/providers/types.ts`        | UPDATE | Add status MessageChunk types                    |
| `packages/cli/src/commands/run.ts`           | UPDATE | Add MCP/Skills status messages to output        |
| `packages/cli/tests/commands/run.test.ts`    | UPDATE | Test status message integration                  |
| `packages/cli/src/providers/mcp.ts`          | UPDATE | Add status chunk emission methods                |
| `packages/cli/tests/e2e-mcp-skills.test.ts`  | CREATE | Comprehensive E2E test with real MCP and Skills |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **New orchestrator classes** - Use existing command flow coordination
- **Complex status dashboards** - Simple status messages only
- **Advanced tool coordination** - Tools work independently as designed
- **Breaking interface changes** - Preserve all existing IAssistantClient behavior
- **Performance optimization** - Focus on basic integration functionality

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: `make validate-l1 && make validate-l2` for verification.

### Task 1: UPDATE `packages/cli/src/providers/types.ts`

- **ACTION**: ADD status MessageChunk types for MCP and Skills
- **IMPLEMENT**: `{ type: 'mcp_status'; serverCount: number; toolCount: number; ... }`
- **MIRROR**: `packages/cli/src/providers/types.ts:2-32` - follow existing union pattern
- **PATTERN**: Simple discriminated union types for status information
- **VALIDATE**: `bun run type-check`
- **TEST_PYRAMID**: No additional tests needed - type definitions only

### Task 2: UPDATE `packages/cli/src/providers/mcp.ts`

- **ACTION**: ADD method to emit status chunks
- **IMPLEMENT**: `getStatusChunk(): MessageChunk` method
- **MIRROR**: `packages/cli/src/providers/mcp.ts:78-95` - follow existing patterns
- **PATTERN**: Simple status information extraction from existing health info
- **VALIDATE**: `bun run type-check && bun run lint`
- **TEST_PYRAMID**: Add integration test for: status chunk generation with mock MCP data

### Task 3: UPDATE `packages/cli/src/commands/run.ts`

- **ACTION**: ADD status messages for MCP tools and Skills in command flow
- **IMPLEMENT**: Emit status chunks showing available capabilities
- **MIRROR**: `packages/cli/src/commands/run.ts:274-299` - follow skills integration pattern
- **PATTERN**: Non-blocking status emission before main AI query
- **VALIDATE**: `bun run type-check && bun run lint`
- **FUNCTIONAL**: `bun packages/cli/src/cli.ts run "What tools do you have?"` - verify status output
- **TEST_PYRAMID**: Add E2E test for: complete command flow with status messages

### Task 4: UPDATE `packages/cli/tests/commands/run.test.ts`

- **ACTION**: ADD tests for status message integration
- **IMPLEMENT**: Test status messages appear in command output
- **MIRROR**: Existing test patterns in the file
- **PATTERN**: Mock MCP and Skills components, verify status output
- **VALIDATE**: `bun test packages/cli/tests/commands/run.test.ts`
- **TEST_PYRAMID**: Add critical user journey test for: status visibility in various scenarios

### Task 5: CREATE `packages/cli/tests/e2e-mcp-skills.test.ts`

- **ACTION**: CREATE comprehensive E2E test with real MCP server, Skills, and Codex
- **IMPLEMENT**: Full workflow test with Context7 MCP and PDF skill
- **PATTERN**: Gated behind `RUN_INTEGRATION_TESTS=1` like existing E2E tests
- **SETUP**: 
  - Create test `.cia/config.json` with Context7 MCP server config
  - Download/setup PDF skill from [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/pdf) repo  
  - Verify Codex auth available (`~/.codex/auth.json`)
- **TEST_SCENARIO**:
  ```typescript
  describe('Full MCP + Skills + Codex Integration', () => {
    it('should run complete workflow with Context7 MCP and PDF skill', async () => {
      // 1. Set up .cia/config.json with Context7 MCP
      const config = {
        "mcp": {
          "context7": {
            "type": "local", 
            "command": ["npx", "-y", "@upstash/context7-mcp"],
            "enabled": true
          }
        },
        "skills": {
          "searchPaths": [".cia/skills"]
        }
      }
      
      // 2. Set up PDF skill in .cia/skills/pdf/
      // 3. Run: cia run --skill pdf "What capabilities do you have?"
      // 4. Verify response mentions both Context7 tools and PDF skill content
      // 5. Verify MCP status chunks are emitted
      // 6. Verify skill context is injected properly
    })
  })
  ```
- **VALIDATE**: `RUN_INTEGRATION_TESTS=1 bun test packages/cli/tests/e2e-mcp-skills.test.ts`
- **FUNCTIONAL**: Complete end-to-end validation of MCP + Skills + Codex integration
- **TEST_PYRAMID**: Add critical user journey test for: real-world usage scenario with all components working together

---

## Testing Strategy

### Unit Tests to Write

| Test File                                        | Test Cases                              | Validates                    |
| ------------------------------------------------ | --------------------------------------- | ---------------------------- |
| `packages/cli/tests/providers/mcp.test.ts`      | status chunk generation                 | MCP status information       |
| `packages/cli/tests/commands/run.test.ts`       | status message integration              | Command flow with status     |
| `packages/cli/tests/e2e-mcp-skills.test.ts`     | full MCP + Skills + Codex workflow     | Real-world integration       |

### Edge Cases Checklist

- [x] MCP not available (should not show MCP status)
- [x] Skills not available (should not show skills status)  
- [x] Both MCP and Skills available (should show both)
- [x] MCP initialization failure (should show error status)
- [x] Skills loading failure (should show warning, continue)
- [x] Context7 MCP server startup failure (graceful degradation)
- [x] Real Codex authentication with MCP tools available
- [x] Skills + MCP coordination in single workflow

---

## Validation Commands

### Level 1: STATIC_ANALYSIS
```bash
make validate-l1
```
**EXPECT**: Exit 0, no TypeScript errors or ESLint warnings

### Level 2: UNIT_TESTS
```bash
make validate-l2
```
**EXPECT**: All tests pass, coverage >= 40%

### Level 3: FUNCTIONAL
```bash
bun packages/cli/src/cli.ts run "What capabilities do you have?"
```
**EXPECT**: Status messages for available MCP tools and Skills

### Level 4: INTEGRATION_TESTS

```bash
RUN_INTEGRATION_TESTS=1 bun test packages/cli/tests/e2e-mcp-skills.test.ts
```

**EXPECT**: Complete MCP + Skills + Codex workflow succeeds

**PREREQUISITES**: 
- Codex auth available (`~/.codex/auth.json`)
- Network access for Context7 MCP server (`npx -y @upstash/context7-mcp`)
- Internet access to download PDF skill if not cached

---

## Acceptance Criteria

- [x] Status messages show available MCP tools and Skills
- [x] Existing command flow preserved exactly
- [x] No new orchestrator classes created
- [x] Non-blocking status emission
- [x] Graceful degradation when MCP/Skills unavailable
- [x] All existing tests continue to pass

---

## Risks and Mitigations

| Risk                                     | Likelihood | Impact | Mitigation                        |
| ---------------------------------------- | ---------- | ------ | --------------------------------- |
| Status messages add unwanted verbosity   | MEDIUM     | LOW    | Make status messages concise      |
| Performance impact from status checks   | LOW        | LOW    | Use existing health info methods  |
| Breaking existing silent operation      | LOW        | MEDIUM | Ensure status is truly additive   |

---

## Notes

This simplified approach follows KISS and SRP principles by:

1. **No new orchestrator class** - responsibilities stay where they belong
2. **Enhances existing flow** - builds on proven patterns in run.ts
3. **Simple status visibility** - uses existing MessageChunk system
4. **Non-breaking changes** - purely additive enhancements

The integration happens naturally through the existing command flow, with MCP and Skills components providing status information when available. This gives users visibility into capabilities without architectural complexity.