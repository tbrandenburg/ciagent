# Investigation: cia run with codex provider times out for simple prompt

**Issue**: #36 (https://github.com/tbrandenburg/ciagent/issues/36)
**Type**: BUG
**Investigated**: 2026-02-21T20:02:53+01:00

### Assessment

| Metric     | Value  | Reasoning |
| ---------- | ------ | --------- |
| Severity   | HIGH   | The default `cia run 'Test' --provider codex` path can fail with exit code 5 before any model output, which breaks the core command and has no practical workaround besides manually increasing timeout. |
| Complexity | MEDIUM | The fix spans 3-4 files (`run.ts`, provider factory behavior assumptions, and run command tests), with moderate integration risk because timeout and status/MCP initialization are cross-cutting. |
| Confidence | MEDIUM | The timeout path is clearly evidenced in code and git history, but exact runtime timing depends on local MCP/server conditions that differ across environments. |

---

## Problem Statement

`cia run 'Test' --provider codex` can hit `Operation timed out after 60s` even for simple prompts because command preflight work is included in the same timeout budget as model response streaming. In environments with MCP config and/or slow provider setup, the request may time out before Codex can emit the first assistant chunk.

---

## Analysis

### Root Cause / Change Rationale

The run command starts its timeout clock too early and spends that budget on setup work (`createAssistantChat`, MCP/status initialization) before response consumption begins. This is amplified by MCP connection reliability defaults (up to ~60s per server path) and by the reliability wrapper delaying visible output until an attempt completes.

### Evidence Chain

WHY: `cia run` returns timeout (exit code 5) for a simple prompt.
↓ BECAUSE: `runCommand` starts a 60s timeout before provider creation and status emission.
Evidence: `packages/cli/src/commands/run.ts:41` - `const abortController = new (globalThis as any).AbortController();`

↓ BECAUSE: setup work is awaited before entering the response stream loop.
Evidence: `packages/cli/src/commands/run.ts:51` - `const assistant = await createAssistantChat(provider, config);`
Evidence: `packages/cli/src/commands/run.ts:59` - `await emitStatusMessages(config);`

↓ BECAUSE: provider creation may block on MCP initialization when MCP config exists.
Evidence: `packages/cli/src/providers/index.ts:27` - `await mcpProvider.initialize(config);`

↓ BECAUSE: MCP initialization can spend large time budgets per server.
Evidence: `packages/cli/src/providers/mcp/manager.ts:138-141` - `executeWithReliability(... { timeout: config.timeout ?? DEFAULT_TIMEOUT, retryOptions: { attempts: 2, delay: 1000 } })`
Evidence: `packages/cli/src/providers/mcp/reliability.ts:7` - `DEFAULT_TIMEOUT = 30000`

↓ ROOT CAUSE: The command-level timeout budget is consumed by pre-query initialization instead of being scoped to query execution/streaming.
Evidence: `packages/cli/src/commands/run.ts:75` - `const hardDeadline = Date.now() + timeoutMs;`

### Affected Files

| File | Lines | Action | Description |
| ---- | ----- | ------ | ----------- |
| `packages/cli/src/commands/run.ts` | 41-90, 541-613 | UPDATE | Start timeout immediately before stream consumption and make status emission truly non-blocking. |
| `packages/cli/tests/commands/run.test.ts` | 215-312 | UPDATE | Add regression coverage for preflight/setup delay not consuming query timeout budget. |
| `packages/cli/tests/cli.test.ts` | related run defaults tests | UPDATE (optional) | Validate default path still uses documented timeout semantics after refactor. |
| `packages/cli/src/providers/index.ts` | 21-37 | NO CHANGE (documented dependency) | Keep MCP init behavior unchanged in this issue unless run.ts fix is insufficient. |

### Integration Points

- `packages/cli/src/cli.ts:154` dispatches `run` command and applies defaults (`timeout: 60`, `retries: 1`) at `packages/cli/src/cli.ts:179-182`.
- `packages/cli/src/commands/run.ts:51` calls `createAssistantChat`, which may initialize MCP through provider factory.
- `packages/cli/src/commands/run.ts:59` invokes `emitStatusMessages`, which also calls MCP provider initialize/status methods.
- Timeout mapping to exit code 5 happens at `packages/cli/src/commands/run.ts:167-170` using `CommonErrors.timeout`.

### Git History

- **Introduced**: `adfd779` (2026-02-11) - foundational run timeout starts before provider execution.
- **Behavior amplified**: `76bb920` (2026-02-18) - added awaited status emission (MCP/Skills) inside run path.
- **Recent timeout semantics update**: `7056ed0` (2026-02-21) - global deadline enforced while streaming; increases sensitivity when preflight consumes budget.
- **Implication**: This is a timing-budget regression in command orchestration, not a Codex auth/config defect.

---

## Implementation Plan

### Step 1: Scope timeout to query execution (not preflight)

**File**: `packages/cli/src/commands/run.ts`
**Lines**: 41-90
**Action**: UPDATE

**Current code:**

```typescript
const abortController = new (globalThis as any).AbortController();
const timeoutSeconds = config.timeout ?? 60;
const timeoutMs = timeoutSeconds * 1000;

const timeoutId = (globalThis as any).setTimeout(() => {
  abortController.abort();
}, timeoutMs);

const assistant = await createAssistantChat(provider, config);
await emitStatusMessages(config);

const chunkIterator = assistant.sendQuery(enhancedPrompt, process.cwd())[Symbol.asyncIterator]();
const hardDeadline = Date.now() + timeoutMs;
```

**Required change:**

```typescript
const timeoutSeconds = config.timeout ?? 60;
const timeoutMs = timeoutSeconds * 1000;

const assistant = await createAssistantChat(provider, config);

// Fire-and-forget status output so it never blocks prompt execution
void emitStatusMessages(config).catch(error => {
  console.log(
    '[Status] Warning: Status emission failed:',
    error instanceof Error ? error.message : String(error)
  );
});

const abortController = new AbortController();
const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
const chunkIterator = assistant.sendQuery(enhancedPrompt, process.cwd())[Symbol.asyncIterator]();
const hardDeadline = Date.now() + timeoutMs;
```

**Why**: Prevents setup latency (MCP/status/provider init) from spending query timeout budget.

---

### Step 2: Keep fail-loud timeout behavior unchanged for actual streaming

**File**: `packages/cli/src/commands/run.ts`
**Lines**: 77-90, 166-170
**Action**: UPDATE (minimal)

**Current code:**

```typescript
if (remainingMs <= 0 || abortController.signal.aborted) {
  throw new Error(`Operation timed out after ${timeoutSeconds} seconds`);
}

const nextChunk = await withTimeout(
  chunkIterator.next(),
  remainingMs,
  `Operation timed out after ${timeoutSeconds} seconds`
);
```

**Required change:**

```typescript
// Keep the same global-deadline logic once query streaming starts.
// No behavior change here besides using the new start point for hardDeadline.
```

**Why**: Preserve the existing global timeout semantics for the model stream while fixing preflight budget misuse.

---

### Step 3: Add regression tests for preflight-delay safety

**File**: `packages/cli/tests/commands/run.test.ts`
**Action**: UPDATE

**Test cases to add:**

```typescript
describe('Timeout budget boundaries', () => {
  it('does not consume timeout budget during provider setup delay', async () => {
    // mock createAssistantChat to resolve after a delay > timeout
    // provider stream itself responds immediately
    // expect success (timeout starts at stream begin)
  });

  it('does not block prompt execution on slow status emission', async () => {
    // mock slow emitStatusMessages dependency path (e.g., mcp initialize)
    // assert assistant output still succeeds within timeout
  });
});
```

**Why**: Locks in the intended contract: `--timeout` applies to model execution, not preflight/status reporting.

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/commands/run.ts:166-170
if (message.includes('timed out') || message.includes('timeout')) {
  const timeoutError = CommonErrors.timeout(timeoutSeconds);
  printError(timeoutError);
  return timeoutError.code;
}
```

```typescript
// SOURCE: packages/cli/tests/commands/run.test.ts:216-237
it('returns timeout exit code when provider stalls before next yield', async () => {
  // short timeout + stalled async generator
  // expect exit code 5 and timeout error output
});
```

---

## Edge Cases & Risks

| Risk/Edge Case | Mitigation |
| -------------- | ---------- |
| Status logs interleave with assistant output when status emission is async | Keep status messages prefixed (`[Status] ...`) and preserve deterministic assistant chunk handling. |
| Existing users rely on timeout covering entire command wall-clock time | Document behavior in help/docs as "provider response timeout" if needed; keep error wording unchanged for compatibility. |
| Slow MCP init still delays provider creation path (`createAssistantChat`) | If timeout issue persists after Step 1, phase-2 follow-up can decouple MCP init from provider factory in a separate issue. |
| Reliability wrapper (default retries=1) still delays first visible chunk | Keep out of scope for this fix; capture as future enhancement if user-perceived latency remains high. |

---

## Validation

### Automated Checks

```bash
bun run type-check
bun test packages/cli/tests/commands/run.test.ts
bun run lint
```

### Manual Verification

1. Run `cia run 'Test' --provider codex` with current local config that previously timed out; verify response returns without exit code 5 under default timeout.
2. Run with a deliberately short timeout (for example `--timeout 1`) and a delayed provider stub/integration path to confirm timeout still fails loudly.

---

## Scope Boundaries

**IN SCOPE:**

- `runCommand` timeout boundary refactor so preflight work does not consume model timeout budget.
- Regression tests covering this timeout boundary.

**OUT OF SCOPE (do not touch):**

- Rewriting `ReliableAssistantChat` chunk buffering/retry architecture.
- MCP manager retry/timeout policy redesign.
- New CLI flags or config schema changes.

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-21T20:02:53+01:00
- **Artifact**: `.claude/PRPs/issues/issue-36.md`
