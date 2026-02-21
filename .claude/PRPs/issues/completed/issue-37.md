# Investigation: codex provider error details are masked by reliability wrapper

**Issue**: #37 (https://github.com/tbrandenburg/ciagent/issues/37)
**Type**: BUG
**Investigated**: 2026-02-21T21:39:29+01:00

### Assessment

| Metric | Value | Reasoning |
| --- | --- | --- |
| Severity | HIGH | The default `run` path (`retries: 1`) hides actionable provider/auth/model errors behind a generic retry message, which blocks users from fixing configuration quickly and affects common Codex usage. |
| Complexity | MEDIUM | The fix is localized to provider error propagation and tests (2-4 files), but it spans wrapper behavior, Codex event mapping, and user-visible CLI output contracts. |
| Confidence | HIGH | Root cause is directly visible in `reliability.ts` where rich error details are dropped and only generic messages are yielded. |

---

## Problem Statement

When Codex emits actionable error details (for example model access or auth failures), the reliability wrapper currently converts them into generic retry-exhausted text. Because retries are enabled by default, this masking happens in normal CLI runs and users lose the original message needed to resolve the problem. The implementation should preserve non-retryable and final retry error details in the surfaced error chunk.

---

## Analysis

### Root Cause / Change Rationale

WHY 1: Why do users see `Provider failed after 1 retry attempts` instead of the original Codex error?
-> Because `ReliableAssistantChat` catches provider failures and emits only `CliError.message` in a final `error` chunk.
Evidence: `packages/cli/src/providers/reliability.ts:136-144`

WHY 2: Why is the original provider detail not included in that final chunk?
-> Because `CommonErrors.retryExhausted(...)` and `CommonErrors.providerUnreliable(...)` place the original reason into `details`, but wrapper yields only `.message`.
Evidence: `packages/cli/src/shared/errors/error-handling.ts:117-123`, `packages/cli/src/shared/errors/error-handling.ts:133-139`, `packages/cli/src/providers/reliability.ts:137`, `packages/cli/src/providers/reliability.ts:144`

WHY 3: Why does this affect normal Codex users rather than only edge configurations?
-> Because CLI defaults set `retries: 1`, and provider factory wraps provider with `ReliableAssistantChat` whenever retries are configured.
Evidence: `packages/cli/src/cli.ts:179`, `packages/cli/src/providers/index.ts:59-64`

WHY 4: Why does the CLI ultimately display the masked value?
-> Because `runCommand` stores `chunk.content` for `error` chunks and wraps it in `CommonErrors.executionFailed(...)`; it has no other error detail channel.
Evidence: `packages/cli/src/commands/run.ts:112-125`

ROOT CAUSE: The reliability wrapper discards actionable underlying provider detail by emitting only generic `CliError.message` text in final error chunks.
Evidence: `packages/cli/src/providers/reliability.ts:132-145`

### Evidence Chain

WHY: Actionable provider errors are masked in default path.
↓ BECAUSE: Default path is reliability-wrapped for Codex.
Evidence: `packages/cli/src/cli.ts:179` - `retries: config.retries ?? 1`; `packages/cli/src/providers/index.ts:63` - `assistantChat = new ReliableAssistantChat(assistantChat, config);`

↓ BECAUSE: Reliability wrapper retries/normalizes provider `error` chunks and thrown exceptions.
Evidence: `packages/cli/src/providers/reliability.ts:80-83` - captures `chunk.type === 'error'`; `packages/cli/src/providers/reliability.ts:109` - `throw new Error(errorMessage)`

↓ BECAUSE: Final emitted chunk uses generic message only.
Evidence: `packages/cli/src/providers/reliability.ts:137` - `yield { type: 'error', content: providerError.message };`; `packages/cli/src/providers/reliability.ts:144` - `yield { type: 'error', content: retryError.message };`

↓ ROOT CAUSE: `CliError.details` is never propagated into emitted chunk content.
Evidence: `packages/cli/src/shared/errors/error-handling.ts:117-123` stores last error in `details`, but wrapper does not include it in yielded content.

### Affected Files

| File | Lines | Action | Description |
| --- | --- | --- | --- |
| `packages/cli/src/providers/reliability.ts` | 132-145, 151-159 | UPDATE | Preserve provider detail in final yielded error chunk content; expand non-retryable matching for access/permission/model-denied terms. |
| `packages/cli/src/providers/codex.ts` | 122-131 | UPDATE | Ensure Codex `error`/`turn.failed` extracts the richest available message from event payload. |
| `packages/cli/tests/providers.reliability.test.ts` | 127-153, 301-314 (+ new cases) | UPDATE | Assert surfaced errors include underlying provider detail (non-retryable + retry-exhausted paths). |
| `packages/cli/tests/commands/run.test.ts` | 54-75 (+ new case) | UPDATE | Assert CLI output path still contains actionable provider error string when wrapper returns failure chunk. |

### Integration Points

- `packages/cli/src/providers/index.ts:15-77` constructs providers and applies `ReliableAssistantChat`.
- `packages/cli/src/commands/run.ts:70-125` consumes stream chunks and maps `error` chunk to user-facing `AI execution failed` output.
- `packages/cli/src/shared/errors/error-handling.ts:19-34` prints `message`, then details; stream chunk path currently carries only one string field.

### Git History

- **Introduced**: `b200fec` - 2026-02-11T07:23:03+01:00 - "feat(providers): implement provider reliability layer with retry logic and contract validation"
- **Last modified**: `54ae8d1` - 2026-02-20T18:05:54+01:00 (reliability file appears in recent history)
- **Implication**: This is long-standing since reliability layer introduction, not a fresh regression from issue #36; default wrapping makes it consistently user-visible.

---

## Implementation Plan

### Step 1: Preserve error details in reliability final emit

**File**: `packages/cli/src/providers/reliability.ts`
**Lines**: 132-145
**Action**: UPDATE

**Current code:**

```typescript
if (isNonRetryableError) {
  const providerError = CommonErrors.providerUnreliable(this.getType(), finalErrorMessage);
  yield { type: 'error', content: providerError.message };
} else {
  const retryError = CommonErrors.retryExhausted(
    maxRetries,
    error instanceof Error ? error.message : String(error)
  );
  yield { type: 'error', content: retryError.message };
}
```

**Required change:**

```typescript
const formatChunkError = (message: string, details?: string): string =>
  details && details.trim().length > 0 ? `${message}: ${details}` : message;

if (isNonRetryableError) {
  const providerError = CommonErrors.providerUnreliable(this.getType(), finalErrorMessage);
  yield {
    type: 'error',
    content: formatChunkError(providerError.message, providerError.details),
  };
} else {
  const retryError = CommonErrors.retryExhausted(
    maxRetries,
    error instanceof Error ? error.message : String(error)
  );
  yield {
    type: 'error',
    content: formatChunkError(retryError.message, retryError.details),
  };
}
```

**Why**: Keep existing generic framing while preserving actionable original reason in the only channel available to `runCommand` (`chunk.content`).

---

### Step 2: Expand non-retryable classification for known auth/model access errors

**File**: `packages/cli/src/providers/reliability.ts`
**Lines**: 151-159
**Action**: UPDATE

**Current code:**

```typescript
const nonRetryablePatterns = [
  'authentication',
  'unauthorized',
  '401',
  'not found',
  '404',
  'contract validation failed',
];
```

**Required change:**

```typescript
const nonRetryablePatterns = [
  'authentication',
  'unauthorized',
  'authorization',
  'forbidden',
  'permission',
  'access denied',
  'invalid api key',
  'model',
  'does not exist',
  '401',
  'not found',
  '404',
  'contract validation failed',
];
```

**Why**: Ensure model access-denied / not-available failures are treated as non-retryable and surfaced immediately.

---

### Step 3: Harden Codex event error extraction

**File**: `packages/cli/src/providers/codex.ts`
**Lines**: 122-131
**Action**: UPDATE

**Current code:**

```typescript
if (eventType === 'error') {
  const message = typeof event.message === 'string' ? event.message : 'Unknown Codex error';
  yield { type: 'error', content: message };
  break;
}

if (eventType === 'turn.failed') {
  const error = event.error as { message?: string } | undefined;
  yield { type: 'error', content: error?.message ?? 'Codex turn failed' };
  break;
}
```

**Required change:**

```typescript
if (eventType === 'error') {
  const eventError = event.error as { message?: string } | undefined;
  const message =
    (typeof event.message === 'string' && event.message) ||
    (typeof eventError?.message === 'string' && eventError.message) ||
    'Unknown Codex error';
  yield { type: 'error', content: message };
  break;
}

if (eventType === 'turn.failed') {
  const error = event.error as { message?: string; cause?: { message?: string } } | undefined;
  const message = error?.message ?? error?.cause?.message ?? 'Codex turn failed';
  yield { type: 'error', content: message };
  break;
}
```

**Why**: Avoid losing useful SDK payload detail before it reaches reliability wrapper.

---

### Step 4: Update and add high-signal tests

**File**: `packages/cli/tests/providers.reliability.test.ts`
**Action**: UPDATE

**Test cases to add/update:**

```typescript
it('includes underlying reason in retry exhausted error output', async () => {
  mockProvider.setShouldThrow(true, 'Persistent failure: ECONNRESET');
  const chunks = await collect(reliableProvider.sendQuery('test prompt', '/tmp'));
  expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
  expect(chunks[0].content).toContain('Persistent failure: ECONNRESET');
});

it('includes non-retryable auth/model reason in reliability output', async () => {
  mockProvider.setShouldThrow(
    true,
    'The model `gpt-5.3-codex` does not exist or you do not have access to it.'
  );
  const chunks = await collect(reliableProvider.sendQuery('test prompt', '/tmp'));
  expect(chunks[0].content).toContain("Provider 'reliable-mock-provider' reliability issue");
  expect(chunks[0].content).toContain('does not exist or you do not have access');
  expect(mockProvider.getCallCount()).toBe(1);
});
```

**File**: `packages/cli/tests/commands/run.test.ts`
**Action**: UPDATE

**Test cases to add:**

```typescript
it('prints actionable provider detail when error chunk includes reliability + detail text', async () => {
  const mockAssistantChat = {
    sendQuery: () => makeGenerator([
      {
        type: 'error',
        content:
          "Provider failed after 1 retry attempts: The model `gpt-5.3-codex` does not exist or you do not have access to it.",
      },
    ]),
    getType: () => 'reliable-codex',
    listModels: vi.fn().mockResolvedValue(['codex-v1']),
  };
  // assert console.error output contains the model/access detail
});
```

**Why**: Lock behavior for both wrapper internals and CLI-facing output without adding broad low-signal test volume.

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:19-24
export function printError(error: CliError): void {
  console.error(`\n❌ Error: ${error.message}`);

  if (error.details) {
    console.error(`   ${error.details}`);
  }
}
```

```typescript
// SOURCE: packages/cli/src/providers/schema-validating-chat.ts:164-169
if (isNonRetryableError) {
  throw new Error(`Schema validation error: ${finalErrorMessage}`);
} else {
  const errorMessage = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Schema validation failed after ${this.config.maxRetries} retries: ${errorMessage}`
  );
}
```

---

## Edge Cases & Risks

| Risk/Edge Case | Mitigation |
| --- | --- |
| Error text becomes too verbose when combining message and details | Use a single separator format (`"<message>: <details>"`) and keep one-line output. |
| Over-classifying retryable errors as non-retryable via broader patterns | Add targeted tests for transient network errors (`timeout`, `connection refused`) to remain retryable. |
| Codex SDK event shape differs from assumptions | Use defensive optional checks and fallback message paths; do not throw during extraction. |
| Existing tests asserting generic-only messages break | Update assertions to check both generic prefix and underlying reason content. |

---

## Validation

### Automated Checks

```bash
npm run type-check
npm run test -- packages/cli/tests/providers.reliability.test.ts packages/cli/tests/commands/run.test.ts
npm run lint
```

### Manual Verification

1. Run `cia run "hello" --provider codex --model gpt-5.3-codex` in an environment without model access and confirm output includes the original provider access/model detail.
2. Trigger a transient failure path (mock or network fault) and confirm retry-exhausted output still includes the last underlying error reason.

---

## Scope Boundaries

**IN SCOPE:**

- Preserve actionable error detail through reliability wrapper into `runCommand` output.
- Improve non-retryable detection for auth/permission/model access-denied style failures.
- Add/update focused tests for the new behavior.

**OUT OF SCOPE (do not touch):**

- Redesigning `ChatChunk` type to include structured error fields.
- Refactoring global CLI error formatting UX beyond this reliability detail propagation.
- Broad provider architecture changes unrelated to Codex/reliability error handling.

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-21T21:39:29+01:00
- **Artifact**: `.claude/PRPs/issues/issue-37.md`
