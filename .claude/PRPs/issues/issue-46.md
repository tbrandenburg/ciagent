# Investigation: Avoid retrying quota/usage-limit failures

**Issue**: #46 (https://github.com/tbrandenberg/ciagent/issues/46)
**Type**: ENHANCEMENT
**Investigated**: 2026-02-22T15:30:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                                                                                                    |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Priority   | HIGH   | This impacts user experience significantly by adding 10+ seconds of unnecessary latency for common quota errors, affecting CLI responsiveness for a frequent error type.     |
| Complexity | LOW    | Single file change to add quota patterns to existing array, isolated modification with low integration risk and established testing patterns.                                |
| Confidence | HIGH   | Clear root cause identified at specific line, exact solution location pinpointed, reference implementation available in schema-validating-chat.ts, strong evidence provided. |

---

## Problem Statement

The reliability layer retries quota/usage-limit failures, adding unnecessary 10+ seconds latency (33s vs 21s) for non-recoverable errors, degrading user experience when hitting common API quotas.

---

## Analysis

### Change Rationale

The `isNonRetryableError()` method in `reliability.ts` lacks quota/usage-limit patterns that should be treated as non-retryable, similar to authentication errors. When quota limits are hit, retrying is futile and only adds latency.

### Evidence Chain

SYMPTOM: CLI shows 33s delay vs 21s for quota errors
↓ BECAUSE: Reliability layer retries quota errors 3 times with backoff
Evidence: `packages/cli/src/providers/reliability.ts:21-30` - `maxRetries = this.config.retries ?? 3`

↓ BECAUSE: `isNonRetryableError()` doesn't include quota patterns
Evidence: `packages/cli/src/providers/reliability.ts:217-231` - Missing quota patterns in array

↓ ROOT CAUSE: Non-retryable patterns array incomplete
Evidence: `packages/cli/src/providers/reliability.ts:217-231` - Array lacks quota/billing patterns that exist in `schema-validating-chat.ts:186-190`

### Affected Files

| File                                                  | Lines    | Action | Description                               |
| ----------------------------------------------------- | -------- | ------ | ----------------------------------------- |
| `packages/cli/src/providers/reliability.ts`          | 217-231  | UPDATE | Add quota patterns to nonRetryablePatterns |
| `packages/cli/tests/providers.reliability.test.ts`   | NEW      | UPDATE | Add test for quota error non-retry behavior |

### Integration Points

- `packages/cli/src/providers/index.ts:76-82` factory wraps providers with reliability
- Error flows through `CommonErrors.providerUnreliable()` (lines 133, 151, 164, 176, 195)
- `pRetry` with `AbortError` mechanism unchanged

### Git History

- **File created**: Initial commit - Contains original patterns
- **Last significant change**: Schema validating chat already has quota patterns
- **Implication**: Intentional gap that needs filling for consistency

---

## Implementation Plan

### Step 1: Add quota patterns to nonRetryablePatterns array

**File**: `packages/cli/src/providers/reliability.ts`
**Lines**: 217-231
**Action**: UPDATE

**Current code:**
```typescript
// Lines 217-231
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

**Required change:**
```typescript
// Lines 217-236 (expanded)
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
  // Quota and billing related (non-recoverable)
  'quota exceeded',
  'usage limit',
  'insufficient_quota',
  'rate limit',
  'billing',
  'payment',
  'subscription',
  'credits',
];
```

**Why**: Matches patterns from `schema-validating-chat.ts` and covers quota terms mentioned in issue

---

### Step 2: Add test for quota error non-retry behavior

**File**: `packages/cli/tests/providers.reliability.test.ts`
**Action**: UPDATE

**Test cases to add:**
```typescript
describe('quota error handling', () => {
  it('should not retry quota exceeded errors', async () => {
    mockProvider.setShouldThrow(
      true,
      'Request failed: quota exceeded for your account'
    );
    
    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }
    
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].content).toContain("Provider 'reliable-mock-provider' reliability issue");
    expect(mockProvider.getCallCount()).toBe(1); // Should not retry
  });

  it('should not retry usage limit errors', async () => {
    mockProvider.setShouldThrow(
      true, 
      'usage limit exceeded, please upgrade your plan'
    );
    
    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }
    
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
    expect(mockProvider.getCallCount()).toBe(1); // Should not retry
  });
});
```

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/providers/schema-validating-chat.ts:180-190
// Pattern for quota-related non-retryable patterns
const nonRetryablePatterns = [
  'authentication',
  'authorization',
  'forbidden',
  'not found',
  'invalid api key',
  'quota exceeded',        // Mirror this
  'rate limit',           // Mirror this  
  'billing',              // Mirror this
  'payment',              // Mirror this
  'subscription',         // Mirror this
];
```

```typescript
// SOURCE: packages/cli/tests/providers.reliability.test.ts:237-253
// Pattern for testing non-retryable errors
it('includes non-retryable auth/model reason in reliability output', async () => {
  mockProvider.setShouldThrow(true, 'Error message here');
  
  const chunks: ChatChunk[] = [];
  for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
    chunks.push(chunk);
  }
  
  expect(chunks).toHaveLength(1);
  expect(chunks[0].type).toBe('error');
  expect(mockProvider.getCallCount()).toBe(1); // Should not retry
});
```

---

## Edge Cases & Risks

| Risk/Edge Case                    | Mitigation                                     |
| --------------------------------- | ---------------------------------------------- |
| Different quota error messages    | Use broad patterns like 'quota', 'usage limit' |
| Case sensitivity                  | Current `.toLowerCase()` handling sufficient   |
| Breaking existing retry logic     | Only adding patterns, not changing logic      |
| Provider-specific error formats   | Cover common variants: quota, usage, billing  |

---

## Validation

### Automated Checks
```bash
bun run type-check
bun test packages/cli/tests/providers.reliability.test.ts
bun run lint
```

### Manual Verification
1. Test with quota error message - should fail immediately (1 call)
2. Test with transient error - should still retry (3 calls)
3. Verify latency reduction from ~33s to ~21s for quota errors

---

## Scope Boundaries

**IN SCOPE:**
- Adding quota/billing patterns to reliability.ts non-retryable list
- Adding corresponding tests 
- Maintaining existing error handling flow

**OUT OF SCOPE (do not touch):**
- Retry configuration logic
- Error message formatting
- Provider-specific implementations
- MCP reliability layer (separate file)

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-22T15:30:00Z
- **Artifact**: `.claude/PRPs/issues/issue-46.md`