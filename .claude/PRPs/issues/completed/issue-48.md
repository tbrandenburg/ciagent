# Investigation: Avoid duplicate MCP initialization to reduce startup latency

**Issue**: #48 (https://github.com/tbrandenburg/ciagent/issues/48)
**Type**: ENHANCEMENT
**Investigated**: 2026-02-22T22:30:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                                                                |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Priority   | MEDIUM | Performance optimization that reduces unnecessary async overhead during startup, but existing guards prevent actual duplicate work        |
| Complexity | LOW    | Simple architectural cleanup affecting only 2 files with clear solution path and minimal risk                                           |
| Confidence | HIGH   | Clear root cause identified with evidence, well-understood code paths, and existing protection mechanisms validate the solution approach |

---

## Problem Statement

The CLI performs redundant MCP initialization calls during startup when verbose mode is enabled, creating unnecessary async overhead even though existing guards prevent actual duplicate work.

---

## Analysis

### Root Cause / Change Rationale

The issue was introduced during the quiet-by-default refactoring (`aa68dc7`) when status emission was moved to a fire-and-forget pattern. While the MCPProvider correctly prevents actual duplicate initialization through its `initialized` flag guard, the redundant calls still create unnecessary async overhead and make the code harder to reason about.

### Evidence Chain

WHY: Duplicate MCP initialization calls occur
↓ BECAUSE: Status emission runs independently and calls initialize()
Evidence: `run.ts:54` - `void emitStatusMessages(config).catch(...)` fires in parallel

↓ BECAUSE: Status emission was made fire-and-forget during verbose flag refactoring
Evidence: `run.ts:554` - `await mcpProvider.initialize(config)` called for status info

↓ ROOT CAUSE: Architectural coupling where status emission duplicates provider creation logic
Evidence: Both `run.ts:46` (createAssistantChat) and `run.ts:54` (emitStatusMessages) trigger MCP initialization

### Affected Files

| File                                   | Lines  | Action | Description                                    |
| -------------------------------------- | ------ | ------ | ---------------------------------------------- |
| `packages/cli/src/commands/run.ts`     | 547-580| UPDATE | Remove redundant MCP initialization           |
| `packages/cli/src/providers/index.ts`  | 30-46  | UPDATE | Export MCP health info for status emission    |

### Integration Points

- `run.ts:46` calls `createAssistantChat()` which initializes MCP via `providers/index.ts:35`
- `run.ts:54` calls `emitStatusMessages()` which redundantly initializes MCP at line 554
- Both use the same singleton `mcpProvider` instance from `providers/mcp.ts`
- Status emission only needs MCP health info, not full initialization

### Git History

- **Introduced**: aa68dc7 - 2026-02-22 - "feat(cli): implement quiet-by-default with --verbose flag"
- **Last modified**: aa68dc7 - Same commit introduced both patterns
- **Implication**: Recent architectural change during reliability improvements, not a long-standing issue

---

## Implementation Plan

### Step 1: Refactor provider factory to return MCP health info

**File**: `packages/cli/src/providers/index.ts`
**Lines**: 30-46
**Action**: UPDATE

**Current code:**

```typescript
// Initialize MCP provider if MCP configuration is present
if (config && mcpServerCount > 0) {
  if (config.verbose) {
    console.log('[Provider Factory] Initializing MCP provider...');
  }
  try {
    await mcpProvider.initialize(config);
    if (config.verbose) {
      const healthInfo = mcpProvider.getHealthInfo();
      console.log(
        `[Provider Factory] MCP provider initialized: ${healthInfo.connectedServers}/${healthInfo.serverCount} servers connected, ${healthInfo.toolCount} tools available`
      );
    }
  } catch (error) {
    console.error('[Provider Factory] MCP provider initialization failed:', error);
    // Continue without MCP - non-blocking
  }
}
```

**Required change:**

```typescript
// Initialize MCP provider if MCP configuration is present
let mcpHealthInfo: any = null;
if (config && mcpServerCount > 0) {
  if (config.verbose) {
    console.log('[Provider Factory] Initializing MCP provider...');
  }
  try {
    await mcpProvider.initialize(config);
    mcpHealthInfo = mcpProvider.getHealthInfo();
    if (config.verbose) {
      console.log(
        `[Provider Factory] MCP provider initialized: ${mcpHealthInfo.connectedServers}/${mcpHealthInfo.serverCount} servers connected, ${mcpHealthInfo.toolCount} tools available`
      );
    }
  } catch (error) {
    console.error('[Provider Factory] MCP provider initialization failed:', error);
    // Continue without MCP - non-blocking
  }
}
```

**Why**: Capture MCP health info during initialization to share with status emission

---

### Step 2: Update createAssistantChat to return MCP info

**File**: `packages/cli/src/providers/index.ts`
**Lines**: 165 (return statement)
**Action**: UPDATE

**Current code:**

```typescript
return chat;
```

**Required change:**

```typescript
return { chat, mcpHealthInfo };
```

**Why**: Pass MCP health info back to run.ts for status emission

---

### Step 3: Update run.ts to use shared MCP health info

**File**: `packages/cli/src/commands/run.ts`  
**Lines**: 46-60
**Action**: UPDATE

**Current code:**

```typescript
const assistant = await createAssistantChat(provider, config);
let printedAssistantOutput = false;
let providerError: string | null = null;
const assistantChunks: string[] = [];
let assistantOutputBytes = 0;

if (config.verbose === true) {
  // Fire-and-forget status output so it never blocks prompt execution
  void emitStatusMessages(config).catch(error => {
    console.log(
      '[Status] Warning: Status emission failed:',
      error instanceof Error ? error.message : String(error)
    );
  });
}
```

**Required change:**

```typescript
const { chat: assistant, mcpHealthInfo } = await createAssistantChat(provider, config);
let printedAssistantOutput = false;
let providerError: string | null = null;
const assistantChunks: string[] = [];
let assistantOutputBytes = 0;

if (config.verbose === true) {
  // Fire-and-forget status output so it never blocks prompt execution
  void emitStatusMessages(config, mcpHealthInfo).catch(error => {
    console.log(
      '[Status] Warning: Status emission failed:',
      error instanceof Error ? error.message : String(error)
    );
  });
}
```

**Why**: Pass already-initialized MCP health info to status emission instead of re-initializing

---

### Step 4: Update emitStatusMessages to use provided MCP info

**File**: `packages/cli/src/commands/run.ts`
**Lines**: 547-580
**Action**: UPDATE

**Current code:**

```typescript
async function emitStatusMessages(config: CIAConfig): Promise<void> {
  const capabilities: string[] = [];
  const mcpServerCount = getMcpServerCount(config);

  // Check MCP status
  if (mcpServerCount > 0) {
    try {
      await mcpProvider.initialize(config);
      const mcpStatusChunk = mcpProvider.getStatusChunk();
      
      if (mcpStatusChunk.type === 'mcp_aggregate_status') {
        const { serverCount, connectedServers, toolCount } = mcpStatusChunk;
        // ... rest of status logic
      }
    } catch (error) {
      console.log(
        '[Status] MCP initialization failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
```

**Required change:**

```typescript
async function emitStatusMessages(config: CIAConfig, mcpHealthInfo?: any): Promise<void> {
  const capabilities: string[] = [];
  const mcpServerCount = getMcpServerCount(config);

  // Check MCP status
  if (mcpServerCount > 0 && mcpHealthInfo) {
    try {
      const mcpStatusChunk = mcpProvider.getStatusChunk();
      
      if (mcpStatusChunk.type === 'mcp_aggregate_status') {
        const { serverCount, connectedServers, toolCount } = mcpStatusChunk;
        // ... rest of status logic (unchanged)
      }
    } catch (error) {
      console.log(
        '[Status] MCP status retrieval failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
```

**Why**: Remove redundant initialization call and use pre-initialized MCP state

---

### Step 5: Update type definitions if needed

**File**: `packages/cli/src/providers/index.ts`
**Lines**: Top of file
**Action**: UPDATE

**Add return type for createAssistantChat:**

```typescript
interface AssistantChatResult {
  chat: any; // Replace with actual chat type
  mcpHealthInfo?: any; // Replace with actual health info type
}
```

**Why**: Provide proper TypeScript support for the new return structure

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/providers/mcp.ts:31-34
// Pattern for initialization guards
if (this.initialized) {
  this.log('[MCP Provider] Already initialized');
  return;
}
```

```typescript
// SOURCE: packages/cli/src/commands/run.ts:54-59
// Pattern for fire-and-forget error handling
void emitStatusMessages(config).catch(error => {
  console.log(
    '[Status] Warning: Status emission failed:',
    error instanceof Error ? error.message : String(error)
  );
});
```

---

## Edge Cases & Risks

| Risk/Edge Case                    | Mitigation                                               |
| --------------------------------- | -------------------------------------------------------- |
| MCP initialization fails          | Existing error handling preserves current behavior      |
| Status emission breaks           | Fire-and-forget pattern ensures main flow continues     |
| Type compatibility issues        | Gradual typing with proper interfaces                   |
| Regression in verbose output     | Maintain exact same status message content and format   |

---

## Validation

### Automated Checks

```bash
# Type checking and linting
bun run type-check
bun test packages/cli/tests/providers/
bun test packages/cli/tests/commands/run.test.ts
bun run lint
```

### Manual Verification

1. Run CLI with `--verbose` flag and verify no duplicate MCP initialization logs
2. Test MCP status emission still works correctly in verbose mode  
3. Verify non-verbose mode behavior unchanged
4. Test MCP initialization failure scenarios maintain error handling

---

## Scope Boundaries

**IN SCOPE:**

- Eliminating redundant MCP initialization call in emitStatusMessages
- Sharing MCP health info between provider creation and status emission
- Maintaining existing error handling behavior

**OUT OF SCOPE (do not touch):**

- MCP provider initialization logic itself (already has proper guards)
- Status message content or formatting
- Fire-and-forget status emission pattern (architectural decision)
- MCP server configuration or connection logic

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-22T22:30:00Z
- **Artifact**: `.claude/PRPs/issues/issue-48.md`