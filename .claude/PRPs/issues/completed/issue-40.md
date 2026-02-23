# Investigation: Add explicit no-timeout mode for run command

**Issue**: #40 (https://github.com/tbrandenburg/ciagent/issues/40)
**Type**: ENHANCEMENT
**Investigated**: 2026-02-23T16:30:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                                                    |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Priority   | MEDIUM | Important for debugging/long-running tasks but not urgent - users can work around with very high timeout values currently |
| Complexity | LOW    | Only 2 files need changes (validation.ts, run.ts), isolated timeout logic, minimal risk to existing functionality       |
| Confidence | HIGH   | Clear root cause identified with specific code locations, well-understood timeout flow, strong evidence from git history  |

---

## Problem Statement

The `cia run` command currently requires `--timeout` to be a positive number and always enforces a hard deadline. Users need an explicit no-timeout mode (`--timeout 0`) to run long debug sessions or handle slow providers without arbitrary timeout ceilings.

---

## Analysis

### Root Cause / Change Rationale

Users need reliable "no timeout" semantics for debugging and long-running operations. Currently there's no deterministic way to disable the run deadline, forcing users to guess arbitrarily high timeout values.

### Evidence Chain

WHY: `--timeout 0` is rejected by CLI
↓ BECAUSE: Validation requires positive numbers only
Evidence: `packages/cli/src/shared/validation/validation.ts:107` - `config.timeout <= 0`

↓ BECAUSE: Original timeout implementation design assumed all timeouts must be positive
Evidence: Commit `54ae8d1` (2026-02-20) - "enforce deterministic timeout and bounded output"

↓ ROOT CAUSE: Missing semantic support for zero timeout as "no timeout" mode
Evidence: `packages/cli/src/commands/run.ts:62-65` - `setTimeout(() => { abortController.abort(); }, timeoutMs)`

### Affected Files

| File                                                                      | Lines   | Action | Description                     |
| ------------------------------------------------------------------------- | ------- | ------ | ------------------------------- |
| `packages/cli/src/shared/validation/validation.ts`                       | 107     | UPDATE | Allow timeout === 0 as valid   |
| `packages/cli/src/commands/run.ts`                                       | 62-87   | UPDATE | Skip timeout logic when zero   |
| `packages/cli/tests/commands/run.test.ts`                                | NEW     | UPDATE | Add no-timeout test coverage    |
| `packages/cli/tests/shared/validation/validation.test.ts`                | NEW     | UPDATE | Add zero timeout validation test|

### Integration Points

- `packages/cli/src/cli.ts:185` applies timeout config to run command
- `packages/cli/src/shared/errors/error-handling.ts:109-115` handles timeout errors (unaffected)
- `packages/cli/src/commands/run.ts:197-211` withTimeout utility needs conditional usage

### Git History

- **Introduced**: 54ae8d1 - 2026-02-20 - "fix(run): enforce deterministic timeout and bounded output"
- **Last modified**: 54ae8d1 - 2026-02-20
- **Implication**: Recent deterministic timeout feature needs extension for no-timeout mode

---

## Implementation Plan

### Step 1: Update Validation to Allow Zero Timeout

**File**: `packages/cli/src/shared/validation/validation.ts`
**Lines**: 107
**Action**: UPDATE

**Current code:**

```typescript
// Line 107
if (isNaN(config.timeout) || config.timeout <= 0) {
```

**Required change:**

```typescript
if (isNaN(config.timeout) || config.timeout < 0) {
```

**Why**: Change from `<= 0` to `< 0` to allow exactly zero as valid "no timeout" value

---

### Step 2: Skip Timeout Logic When Zero

**File**: `packages/cli/src/commands/run.ts`
**Lines**: 41-65
**Action**: UPDATE

**Current code:**

```typescript
// Lines 41-65
const timeoutSeconds = config.timeout ?? 60;
const timeoutMs = timeoutSeconds * 1000; // Convert to milliseconds
let timeoutId: ReturnType<typeof setTimeout> | undefined;

// ... (assistant setup code) ...

const abortController = new AbortController();
timeoutId = setTimeout(() => {
  abortController.abort();
}, timeoutMs);
```

**Required change:**

```typescript
const timeoutSeconds = config.timeout ?? 60;
const timeoutMs = timeoutSeconds * 1000; // Convert to milliseconds
let timeoutId: ReturnType<typeof setTimeout> | undefined;

// ... (assistant setup code) ...

const abortController = new AbortController();
if (timeoutSeconds > 0) {
  timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);
}
```

**Why**: Only create timeout when timeoutSeconds > 0 to enable no-timeout mode

---

### Step 3: Skip Hard Deadline Logic When Zero

**File**: `packages/cli/src/commands/run.ts`
**Lines**: 75-87
**Action**: UPDATE

**Current code:**

```typescript
// Lines 75-87
const hardDeadline = Date.now() + timeoutMs;

while (true) {
  const remainingMs = hardDeadline - Date.now();
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
const hardDeadline = timeoutSeconds > 0 ? Date.now() + timeoutMs : Number.MAX_SAFE_INTEGER;

while (true) {
  const remainingMs = timeoutSeconds > 0 ? hardDeadline - Date.now() : Number.MAX_SAFE_INTEGER;
  if ((timeoutSeconds > 0 && remainingMs <= 0) || abortController.signal.aborted) {
    throw new Error(`Operation timed out after ${timeoutSeconds} seconds`);
  }

  const nextChunk = timeoutSeconds > 0 
    ? await withTimeout(
        chunkIterator.next(),
        remainingMs,
        `Operation timed out after ${timeoutSeconds} seconds`
      )
    : await chunkIterator.next();
```

**Why**: Skip both hard deadline checks and withTimeout wrapper when timeout is zero

---

### Step 4: Add Validation Test Coverage

**File**: `packages/cli/tests/shared/validation/validation.test.ts`  
**Action**: UPDATE

**Test case to add:**

```typescript
describe('timeout validation', () => {
  it('should accept timeout value of 0 (no timeout mode)', () => {
    const result = validateConfig({ timeout: 0 });
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should reject negative timeout values', () => {
    const result = validateConfig({ timeout: -1 });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid timeout: -1. Must be a positive number.');
  });
});
```

---

### Step 5: Add Run Command Test Coverage

**File**: `packages/cli/tests/commands/run.test.ts`
**Action**: UPDATE

**Test case to add:**

```typescript
describe('timeout behavior', () => {
  it('should not timeout when timeout is 0 (no timeout mode)', async () => {
    const mockAssistantChat = {
      sendQuery: () => makeGenerator([
        { type: 'assistant', content: 'processing...' },
        { type: 'assistant', content: 'still working...' },
        { type: 'assistant', content: 'done' }
      ]),
      getType: () => 'codex',
      listModels: vi.fn().mockResolvedValue(['codex-v1']),
    };

    // Simulate slow provider that would normally timeout
    vi.spyOn(providers, 'createAssistantChat').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Longer than normal test delays
      return mockAssistantChat;
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await runCommand(['long task'], { provider: 'codex', timeout: 0 });

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('done');

    logSpy.mockRestore();
  });
});
```

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/shared/validation/validation.ts:112-115
// Pattern for allowing zero as valid (retries allows >= 0)
if (config.retries !== undefined) {
  if (isNaN(config.retries) || config.retries < 0) {
    errors.push(`Invalid retries: ${config.retries}. Must be a non-negative number.`);
  }
}

// SOURCE: packages/cli/src/commands/run.ts:288-340 (test pattern)
// Pattern for timeout testing with small fractional values
const exitCode = await runCommand(['hello'], { provider: 'codex', timeout: 0.05 });
```

---

## Edge Cases & Risks

| Risk/Edge Case                                | Mitigation                                                      |
| --------------------------------------------- | --------------------------------------------------------------- |
| Infinite loop with slow/stalled providers    | AbortController still available for manual cancellation        |
| Memory growth from unbounded output          | Existing 1MB output cap remains enforced regardless of timeout |
| Breaking existing timeout > 0 behavior       | All existing timeout logic preserved with conditional guards    |
| Test flakiness from timing-sensitive tests   | Use deterministic mocking instead of relying on actual delays  |

---

## Validation

### Automated Checks

```bash
# Project uses Bun
bun run type-check
bun test packages/cli/tests/shared/validation/validation.test.ts
bun test packages/cli/tests/commands/run.test.ts
bun run lint
```

### Manual Verification

1. Run `cia run "test prompt" --timeout 0` and verify no timeout errors occur
2. Run `cia run "test prompt" --timeout 5` and verify existing timeout behavior preserved
3. Run `cia run "test prompt" --timeout -1` and verify validation rejects negative values

---

## Scope Boundaries

**IN SCOPE:**

- Allow `--timeout 0` as valid configuration
- Skip timeout enforcement when timeout is zero
- Add test coverage for no-timeout mode

**OUT OF SCOPE (do not touch):**

- MCP timeout policy changes
- Reliability wrapper timeout architecture 
- Provider-specific timeout implementations
- Default timeout value changes (remains 60 seconds)
- Output size limits (1MB cap remains regardless of timeout)

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-23T16:30:00Z
- **Artifact**: `.claude/PRPs/issues/issue-40.md`