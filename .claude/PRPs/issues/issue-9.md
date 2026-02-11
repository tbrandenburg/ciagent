# Investigation: 🧪 Test Suite Architecture Issues: 20s+ timeouts indicate broken retry logic

**Issue**: #9 (https://github.com/tbrandenburg/ciagent/issues/9)
**Type**: BUG
**Investigated**: 2026-02-11T15:30:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                                                                                                |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Severity   | MEDIUM | Tests fail with 20s+ timeouts disrupting CI/CD, but retry logic actually works correctly - it's the test configuration causing realistic but slow retry delays for tests |
| Complexity | MEDIUM | 3 files need updates (test config, test setup patterns), moderate risk due to test timing dependencies and retry configuration changes                                     |
| Confidence | HIGH   | Clear evidence from code analysis shows retry logic works correctly, root cause is exponential backoff + randomization causing expected but slow test execution          |

---

## Problem Statement

Test suite experiences 20+ second timeouts in reliability tests, but investigation reveals the retry logic is functioning correctly - the issue is test configuration using production-appropriate retry delays that are too slow for test environments.

---

## Analysis

### Root Cause / Change Rationale

The tests are not actually "broken" - they're experiencing expected delays from properly configured retry logic with exponential backoff and random jitter.

### Evidence Chain

WHY: Tests timeout at 20+ seconds
↓ BECAUSE: "Error Normalization" test runs 5 test cases with retryable errors  
Evidence: `packages/cli/tests/providers.reliability.test.ts:238-267` - Loop through test cases with 20s timeout

↓ BECAUSE: Each retryable error goes through full retry cycle with exponential backoff
Evidence: `packages/cli/src/providers/reliability.ts:94-104` - p-retry config with exponential delays

↓ BECAUSE: Production-appropriate retry settings used in tests
Evidence: `packages/cli/tests/providers.reliability.test.ts:64-68` - Config with 3 retries, backoff enabled, 5s timeout

↓ ROOT CAUSE: Test environment using production retry timing instead of fast test timing
Evidence: `packages/cli/src/providers/reliability.ts:97-99` - minTimeout: 1000ms, randomize: true causing 1s-4s+ delays per retry

### Affected Files

| File                                               | Lines   | Action | Description                               |
| -------------------------------------------------- | ------- | ------ | ----------------------------------------- |
| `packages/cli/tests/providers.reliability.test.ts` | 64-68   | UPDATE | Add test-specific fast retry config      |
| `packages/cli/tests/providers.reliability.test.ts` | 238-267 | UPDATE | Split long-running test into faster ones |
| `packages/cli/tests/providers.reliability.test.ts` | 73-75   | UPDATE | Add proper cleanup in afterEach          |

### Integration Points

- `packages/cli/src/providers/reliability.ts:94-104` - p-retry configuration consumed by ReliableAssistantChat
- Test configuration at `packages/cli/tests/providers.reliability.test.ts:64-68` affects all reliability tests
- MockProvider call counting at `packages/cli/tests/providers.reliability.test.ts:48-50` works correctly

### Git History

- **Introduced**: b200fec - 2026-02-11 - "feat(providers): implement provider reliability layer with retry logic and contract validation"
- **Last modified**: b200fec - 2026-02-11
- **Implication**: New feature with production-appropriate retry settings but not optimized for test environment

---

## Implementation Plan

### Step 1: Add Test-Specific Fast Retry Configuration

**File**: `packages/cli/tests/providers.reliability.test.ts`
**Lines**: 62-70
**Action**: UPDATE

**Current code:**

```typescript
// Lines 62-70
beforeEach(() => {
  mockProvider = new MockProvider();
  config = {
    retries: 3,
    'retry-backoff': true,
    'retry-timeout': 5000,
    'contract-validation': false,
  };
  reliableProvider = new ReliableAssistantChat(mockProvider, config);
});
```

**Required change:**

```typescript
beforeEach(() => {
  mockProvider = new MockProvider();
  // Fast configuration for tests - preserves retry logic but with minimal delays
  config = {
    retries: 3,
    'retry-backoff': false,     // Disable exponential backoff in tests
    'retry-timeout': 1000,      // Reduce max timeout from 5000ms to 1000ms
    'contract-validation': false,
  };
  reliableProvider = new ReliableAssistantChat(mockProvider, config);
});
```

**Why**: Maintains retry logic behavior but uses constant 500ms delays instead of exponential 1000ms-4000ms+ delays

---

### Step 2: Add Proper Test Cleanup

**File**: `packages/cli/tests/providers.reliability.test.ts`
**Lines**: 73-75
**Action**: UPDATE

**Current code:**

```typescript
// Lines 73-75
afterEach(() => {
  // Reset mock provider state
});
```

**Required change:**

```typescript
afterEach(() => {
  // Reset mock provider state
  mockProvider.setShouldThrow(false);
  mockProvider.setChunks([]);
});
```

**Why**: Ensures clean state between tests and prevents test pollution

---

### Step 3: Split Long-Running Test Into Faster Individual Tests

**File**: `packages/cli/tests/providers.reliability.test.ts`
**Lines**: 238-267
**Action**: UPDATE

**Current code:**

```typescript
// Lines 238-267
it('should handle different error types appropriately', async () => {
  const testCases = [
    { error: 'authentication failed', shouldRetry: false },
    { error: 'unauthorized access', shouldRetry: false },
    { error: 'not found', shouldRetry: false },
    { error: 'network timeout', shouldRetry: true },
    { error: 'connection refused', shouldRetry: true },
  ];

  for (const testCase of testCases) {
    mockProvider = new MockProvider();
    reliableProvider = new ReliableAssistantChat(mockProvider, config);
    mockProvider.setShouldThrow(true, testCase.error);

    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }

    if (testCase.shouldRetry) {
      expect(mockProvider.getCallCount()).toBe(4); // Should exhaust retries (original + 3)
      expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
    } else {
      expect(mockProvider.getCallCount()).toBe(1); // Should not retry
      expect(chunks[0].content).toContain(
        "Provider 'reliable-mock-provider' reliability issue"
      );
    }
  }
}, 20000);
```

**Required change:**

```typescript
describe('Error Type Handling', () => {
  it('should not retry authentication errors', async () => {
    mockProvider.setShouldThrow(true, 'authentication failed');

    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }

    expect(mockProvider.getCallCount()).toBe(1); // Should not retry
    expect(chunks[0].content).toContain(
      "Provider 'reliable-mock-provider' reliability issue"
    );
  });

  it('should not retry unauthorized errors', async () => {
    mockProvider.setShouldThrow(true, 'unauthorized access');

    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }

    expect(mockProvider.getCallCount()).toBe(1);
    expect(chunks[0].content).toContain(
      "Provider 'reliable-mock-provider' reliability issue"
    );
  });

  it('should not retry not found errors', async () => {
    mockProvider.setShouldThrow(true, 'not found');

    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }

    expect(mockProvider.getCallCount()).toBe(1);
    expect(chunks[0].content).toContain(
      "Provider 'reliable-mock-provider' reliability issue"
    );
  });

  it('should retry network timeout errors', async () => {
    mockProvider.setShouldThrow(true, 'network timeout');

    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }

    expect(mockProvider.getCallCount()).toBe(4); // Should exhaust retries (original + 3)
    expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
  });

  it('should retry connection refused errors', async () => {
    mockProvider.setShouldThrow(true, 'connection refused');

    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }

    expect(mockProvider.getCallCount()).toBe(4); // Should exhaust retries (original + 3)
    expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
  });
});
```

**Why**: Individual tests run faster and provide better failure isolation, reducing overall test suite time

---

### Step 4: Add Test for Fast Configuration

**File**: `packages/cli/tests/providers.reliability.test.ts`
**Lines**: 301 (after last test)
**Action**: CREATE

**Test cases to add:**

```typescript
describe('Test Environment Optimization', () => {
  it('should complete retry cycles quickly with disabled backoff', async () => {
    const startTime = Date.now();
    mockProvider.setShouldThrow(true, 'network timeout');

    const chunks: ChatChunk[] = [];
    for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
      chunks.push(chunk);
    }

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(3000); // Should complete in under 3 seconds
    expect(mockProvider.getCallCount()).toBe(4); // Still does full retry cycle
    expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
  });
});
```

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/tests/providers.reliability.test.ts:155-167
// Pattern for test-specific configuration overrides
config.retries = 1; // Only 1 retry
reliableProvider = new ReliableAssistantChat(mockProvider, config);
```

```typescript
// SOURCE: packages/cli/src/providers/reliability.ts:97-99  
// Pattern for retry timing configuration
minTimeout: useBackoff ? 1000 : 500,  // 500ms for non-backoff (tests)
maxTimeout: retryTimeout,             // Respects configured timeout
randomize: useBackoff,                // No randomization for tests
```

---

## Edge Cases & Risks

| Risk/Edge Case                     | Mitigation                                         |
| ---------------------------------- | -------------------------------------------------- |
| Tests complete too fast to verify | Add timing verification test to ensure retry works |
| Production config accidentally used | Document test vs production config differences     |
| Flaky tests due to timing          | Use fixed delays instead of random backoff        |
| Missing retry behavior validation  | Keep call count assertions to verify retry logic   |

---

## Validation

### Automated Checks

```bash
# Run the specific failing tests to verify they now pass quickly
bun test packages/cli/tests/providers.reliability.test.ts

# Verify overall test suite performance improvement  
bun test --reporter=verbose packages/cli/tests/

# Ensure no regressions in other test suites
bun run type-check
bun run lint
```

### Manual Verification

1. Run reliability tests and verify completion under 10 seconds total
2. Verify retry call counts still match expectations (retry logic preserved)
3. Run individual error handling tests to ensure they complete under 1 second each
4. Verify production retry behavior unchanged in actual CLI usage

---

## Scope Boundaries

**IN SCOPE:**

- Test configuration optimization for faster execution
- Test cleanup and isolation improvements  
- Individual test case separation for better performance
- Retry timing configuration for test environment

**OUT OF SCOPE (do not touch):**

- Production retry logic implementation (works correctly)
- p-retry library configuration for production use
- ReliableAssistantChat core functionality
- Contract validation logic
- Mock provider implementation (works correctly)
- Error detection and classification logic

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-11T15:30:00Z
- **Artifact**: `.claude/PRPs/issues/issue-9.md`