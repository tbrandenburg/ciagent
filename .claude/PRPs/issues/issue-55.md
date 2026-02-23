# Investigation: Replace custom retry logic with proper p-retry library usage

**Issue**: #55 (https://github.com/tbrandenburg/ciagent/issues/55)
**Type**: REFACTOR
**Investigated**: 2026-02-23T15:30:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                            |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Priority   | HIGH   | High consistency value with existing codebase patterns, reduces maintenance burden, improves reliability |
| Complexity | MEDIUM | 3 key files affected with established integration points, but well-understood p-retry patterns exist to mirror |
| Confidence | HIGH   | Clear scope identified, strong evidence from codebase exploration, existing p-retry usage as reference pattern |

---

## Problem Statement

The MCP reliability layer contains 307 lines of custom retry/timeout logic while p-retry is already available and used extensively in the main provider reliability layer. This creates inconsistency, maintenance overhead, and potential resource leak risks from manual timeout handling.

---

## Analysis

### Change Rationale

The codebase already demonstrates sophisticated p-retry usage in `packages/cli/src/providers/reliability.ts` with advanced features like abort controllers, retry windows, contract validation, and proper error handling. The MCP layer's custom implementation (81 lines of retry logic) duplicates this functionality with:
- Manual exponential backoff calculations (lines 98-100) 
- Custom timeout handling with setTimeout/clearTimeout (lines 63-76)
- Basic retry loop without advanced features (lines 91-103)

### Evidence Chain

WHY: Custom retry implementation creates maintenance burden and inconsistency
↓ BECAUSE: p-retry is already imported and used extensively elsewhere
Evidence: `packages/cli/src/providers/reliability.ts:1` - `import pRetry, { AbortError } from 'p-retry';`

↓ BECAUSE: Main reliability layer has sophisticated p-retry patterns we should mirror
Evidence: `packages/cli/src/providers/reliability.ts:36-118` - Complete p-retry implementation with abort controllers, retry windows, randomization

↓ ROOT CAUSE: MCP reliability duplicates functionality instead of using established patterns
Evidence: `packages/cli/src/providers/mcp/reliability.ts:81-104` - Custom retry function that reimplements p-retry features

### Affected Files

| File                                                        | Lines    | Action | Description                                |
| ----------------------------------------------------------- | -------- | ------ | ------------------------------------------ |
| `packages/cli/src/providers/mcp/reliability.ts`            | 81-119   | UPDATE | Replace custom retry with p-retry patterns |
| `packages/cli/tests/providers/mcp/reliability.test.ts`     | Multiple | UPDATE | Update tests for p-retry behavior         |
| `packages/cli/src/providers/mcp/manager.ts`                | 139,240  | VERIFY | Ensure integration points still work      |

### Integration Points

- `packages/cli/src/providers/mcp/manager.ts:139` - `executeWithReliability(() => this.createConnection(name, config))`
- `packages/cli/src/providers/mcp/manager.ts:240` - `withTimeout(client.connect(transport), timeout)`
- `packages/cli/src/providers/mcp/manager.ts:244` - `withTimeout(client.listTools(), timeout)`
- Health monitoring integration via `connectionMonitor.updateHealth()` calls

### Git History

- **Introduced**: d732d78 - 2026-02-17 - "feat(mcp): implement comprehensive MCP integration framework with OAuth 2.1 PKCE authentication"
- **Last modified**: 95043d6 - 2026-02-22 - "Fix: Consider defaulting retries to 0 for interactive run commands (#47)"
- **Implication**: Recent addition, good opportunity to align with established patterns without breaking existing users

---

## Implementation Plan

### Step 1: Import p-retry and AbortError

**File**: `packages/cli/src/providers/mcp/reliability.ts`
**Lines**: 1-5
**Action**: UPDATE

**Current code:**

```typescript
/**
 * MCP Reliability Layer - Error Handling & Timeouts
 * Provides connection timeout management, graceful degradation, retry logic, and health monitoring
 */
```

**Required change:**

```typescript
/**
 * MCP Reliability Layer - Error Handling & Timeouts  
 * Provides connection timeout management, graceful degradation, retry logic, and health monitoring
 */

import pRetry, { AbortError } from 'p-retry';
```

**Why**: Import p-retry to replace custom retry logic

---

### Step 2: Replace custom retry function with p-retry wrapper

**File**: `packages/cli/src/providers/mcp/reliability.ts`
**Lines**: 81-104
**Action**: UPDATE

**Current code:**

```typescript
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    delay = 500,
    factor = 2,
    maxDelay = 10000,
    retryIf = isTransientError,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !retryIf(error)) {throw error;}

      // Calculate exponential backoff delay
      const wait = Math.min(delay * Math.pow(factor, attempt), maxDelay);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}
```

**Required change:**

```typescript
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    delay = 500,
    factor = 2,
    maxDelay = 10000,
    retryIf = isTransientError,
  } = options;

  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (error) {
        // Convert non-retryable errors to AbortError to prevent retries
        if (!retryIf(error)) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          throw new AbortError(errorMsg);
        }
        throw error;
      }
    },
    {
      retries: attempts - 1, // p-retry uses retries, not attempts
      factor,
      minTimeout: delay,
      maxTimeout: maxDelay,
      randomize: false, // Keep current behavior, can be enabled later
    }
  );
}
```

**Why**: Replace manual retry loop with p-retry while maintaining same interface and behavior

---

### Step 3: Enhance executeWithReliability with p-retry features

**File**: `packages/cli/src/providers/mcp/reliability.ts`
**Lines**: 109-119
**Action**: UPDATE

**Current code:**

```typescript
export async function executeWithReliability<T>(
  operation: () => Promise<T>,
  options: {
    timeout?: number;
    retryOptions?: RetryOptions;
  } = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, retryOptions } = options;

  return retry(() => withTimeout(operation(), timeout), retryOptions);
}
```

**Required change:**

```typescript
export async function executeWithReliability<T>(
  operation: () => Promise<T>,
  options: {
    timeout?: number;
    retryOptions?: RetryOptions;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, retryOptions, signal } = options;

  // Use p-retry directly for better integration and timeout handling
  return pRetry(
    async () => {
      if (signal?.aborted) {
        throw new AbortError('Operation aborted');
      }
      
      try {
        return await withTimeout(operation(), timeout);
      } catch (error) {
        // Apply custom retry condition if provided
        if (retryOptions?.retryIf && !retryOptions.retryIf(error)) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          throw new AbortError(errorMsg);
        }
        throw error;
      }
    },
    {
      retries: (retryOptions?.attempts || 3) - 1,
      factor: retryOptions?.factor || 2,
      minTimeout: retryOptions?.delay || 500,
      maxTimeout: retryOptions?.maxDelay || 10000,
      maxRetryTime: timeout * ((retryOptions?.attempts || 3) + 1), // Retry window
      signal,
      randomize: false,
    }
  );
}
```

**Why**: Direct p-retry usage with proper abort signal support and timeout integration

---

### Step 4: Update withGracefulDegradation to use new patterns

**File**: `packages/cli/src/providers/mcp/reliability.ts`
**Lines**: 238-256
**Action**: UPDATE

**Current code:**

```typescript
export async function withGracefulDegradation<T>(
  operation: () => Promise<T>,
  defaultValue: T,
  options: {
    timeout?: number;
    retryOptions?: RetryOptions;
    onError?: (error: unknown) => void;
  } = {}
): Promise<T> {
  try {
    return await executeWithReliability(operation, {
      timeout: options.timeout,
      retryOptions: options.retryOptions,
    });
  } catch (error) {
    options.onError?.(error);
    return defaultValue;
  }
}
```

**Required change:**

```typescript
export async function withGracefulDegradation<T>(
  operation: () => Promise<T>,
  defaultValue: T,
  options: {
    timeout?: number;
    retryOptions?: RetryOptions;
    signal?: AbortSignal;
    onError?: (error: unknown) => void;
  } = {}
): Promise<T> {
  try {
    return await executeWithReliability(operation, {
      timeout: options.timeout,
      retryOptions: options.retryOptions,
      signal: options.signal,
    });
  } catch (error) {
    options.onError?.(error);
    return defaultValue;
  }
}
```

**Why**: Add abort signal support for consistency with enhanced executeWithReliability

---

### Step 5: Update RetryOptions interface for p-retry compatibility

**File**: `packages/cli/src/providers/mcp/reliability.ts`
**Lines**: 12-18
**Action**: UPDATE

**Current code:**

```typescript
export interface RetryOptions {
  attempts?: number;
  delay?: number;
  factor?: number;
  maxDelay?: number;
  retryIf?: (error: unknown) => boolean;
}
```

**Required change:**

```typescript
export interface RetryOptions {
  attempts?: number;
  delay?: number;
  factor?: number;
  maxDelay?: number;
  retryIf?: (error: unknown) => boolean;
  randomize?: boolean; // New: Enable jitter in backoff
  signal?: AbortSignal; // New: Support abort signals
}
```

**Why**: Add modern retry options while maintaining backward compatibility

---

### Step 6: Update tests for p-retry behavior

**File**: `packages/cli/tests/providers/mcp/reliability.test.ts`
**Action**: UPDATE

**Test cases to update:**

```typescript
describe('retry', () => {
  it('should use p-retry under the hood', async () => {
    // Verify p-retry specific behaviors like proper backoff timing
    const start = Date.now();
    const retryOptions = { attempts: 3, delay: 100, factor: 2 };
    
    let callCount = 0;
    const operation = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) throw new Error('transient failure');
      return 'success';
    });

    await retry(operation, retryOptions);
    
    const elapsed = Date.now() - start;
    // p-retry should respect timing: ~0ms + ~100ms + ~200ms = ~300ms minimum
    expect(elapsed).toBeGreaterThan(250);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should handle AbortError for non-retryable errors', async () => {
    const retryIf = jest.fn().mockReturnValue(false);
    const operation = jest.fn().mockRejectedValue(new Error('non-retryable'));
    
    await expect(retry(operation, { retryIf })).rejects.toThrow('non-retryable');
    expect(operation).toHaveBeenCalledTimes(1); // No retries for AbortError
  });
});
```

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/providers/reliability.ts:36-43
// Pattern for AbortError usage and signal handling
if (retryWindowController.signal.aborted) {
  const reason = retryWindowController.signal.reason;
  const reasonMessage = reason instanceof Error ? reason.message : String(reason);
  isNonRetryableError = true;
  finalErrorMessage = reasonMessage;
  throw new AbortError(reasonMessage);
}
```

```typescript
// SOURCE: packages/cli/src/providers/reliability.ts:106-118  
// Pattern for p-retry configuration with proper options
{
  retries: maxRetries,
  factor: useBackoff ? 2 : 1,
  minTimeout: useBackoff ? 1000 : 500,
  maxTimeout: retryTimeout,
  maxRetryTime: retryWindowMs,
  signal: retryWindowController.signal,
  randomize: useBackoff,
  onFailedAttempt: () => {
    // Optional: log retry attempts (can be enabled for debugging)
  },
}
```

---

## Edge Cases & Risks

| Risk/Edge Case                        | Mitigation                                                    |
| ------------------------------------- | ------------------------------------------------------------- |
| Breaking existing timeout behavior    | Keep withTimeout function, integrate with p-retry timeouts   |
| Test timing sensitivity               | Update test expectations for p-retry's precise timing        |
| Interface compatibility               | Maintain all existing function signatures and behaviors      |
| AbortSignal not properly propagated   | Add signal parameter to all public functions                 |
| Connection monitoring affected        | Preserve all MCPConnectionMonitor and TimeoutManager classes |

---

## Validation

### Automated Checks

```bash
# Type checking and linting
bun run type-check
bun run lint

# Run MCP-specific reliability tests
bun test packages/cli/tests/providers/mcp/reliability.test.ts

# Run integration tests for MCP manager
bun test packages/cli/tests/providers/mcp/manager.test.ts

# Full test suite to ensure no regressions
bun test
```

### Manual Verification

1. Verify MCP connections still establish properly with same timeout behavior
2. Confirm retry attempts follow expected exponential backoff pattern
3. Test abort signal propagation works correctly for graceful shutdowns
4. Validate error categorization (retryable vs non-retryable) remains the same

---

## Scope Boundaries

**IN SCOPE:**

- Replace custom retry function with p-retry wrapper
- Update executeWithReliability to use p-retry directly  
- Add AbortSignal support throughout reliability layer
- Update RetryOptions interface for modern features
- Update tests for p-retry specific behaviors

**OUT OF SCOPE (do not touch):**

- MCPConnectionMonitor class (health monitoring logic)
- TimeoutManager class (timeout management utility)
- withTimeout function (Promise timeout wrapper - may enhance later)
- Global instances and monitoring setup
- MCP manager integration points (verify only)
- Authentication and OAuth logic
- Core MCP protocol implementation

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-23T15:30:00Z
- **Artifact**: `.claude/PRPs/issues/issue-55.md`