# Investigation: Consider defaulting retries to 0 for interactive run commands

**Issue**: #47 (https://github.com/tbrandenburg/ciagent/issues/47)
**Type**: ENHANCEMENT
**Investigated**: 2026-02-22T14:30:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                                                                         |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Priority   | HIGH   | Affects ALL interactive CLI users with 12-second penalty on failed commands, severely impacting developer workflow and CLI responsiveness       |
| Complexity | MEDIUM | Requires modifying 2-3 core files, adding context detection logic, comprehensive testing, but leverages existing TTY patterns and wrapper logic |
| Confidence | HIGH   | Clear performance data provided, existing TTY detection patterns in codebase, comprehensive test coverage for retries=0, well-understood scope |

---

## Problem Statement

The CLI currently defaults to retries=1 for all commands, causing a 12-second latency penalty for interactive users when errors occur (failed commands take ~33s instead of ~21s). This degrades the interactive developer experience while providing minimal benefit in terminal contexts where fast feedback is more valuable than automated retry logic.

---

## Analysis

### Root Cause / Change Rationale

The current default was established to provide reliability for automated environments, but creates poor user experience for interactive terminal usage where immediate feedback is prioritized over retry resilience.

### Evidence Chain

**PERFORMANCE IMPACT**: Interactive users experience significant delays on failed commands  
↓ BECAUSE: All commands default to retries=1 regardless of context  
Evidence: `packages/cli/src/cli.ts:180` - `retries: config.retries ?? 1,`

↓ BECAUSE: withDefaults() applies static default without context awareness  
Evidence: `packages/cli/src/cli.ts:175-185` - withDefaults() function lacks context detection

↓ ROOT CAUSE: No differentiation between interactive terminal and CI/automation contexts  
Evidence: Missing context detection in default configuration logic

### Affected Files

| File                                                | Lines   | Action | Description                                       |
| --------------------------------------------------- | ------- | ------ | ------------------------------------------------- |
| `packages/cli/src/shared/config/loader.ts`         | NEW     | UPDATE | Add isInteractiveContext() function               |
| `packages/cli/src/cli.ts`                          | 175-185 | UPDATE | Modify withDefaults() to use context-aware logic |
| `packages/cli/tests/cli.test.ts`                   | NEW     | UPDATE | Add tests for context-aware defaults             |
| `packages/cli/src/commands/help.ts`                | 70-80   | UPDATE | Update help text to explain smart defaults       |

### Integration Points

- `packages/cli/src/cli.ts:180` - Default retry value determination
- `packages/cli/src/providers/index.ts:77` - Conditional reliability wrapper (unchanged)
- `packages/cli/tests/cli.test.ts` - Configuration testing
- `packages/cli/src/commands/run.ts:18,324` - Already uses TTY detection patterns

### Git History

- **Introduced**: 37fdefbc - 2026-02-10 - "refactor(cli): streamline scaffold with codex/claude providers"
- **Last modified**: aa68dc7 - Recent CLI improvements
- **Implication**: Default was set during reliability layer implementation, not optimized for interactive usage

---

## Implementation Plan

### Step 1: Add Context Detection Function

**File**: `packages/cli/src/shared/config/loader.ts`  
**Lines**: After existing functions (around line 240)  
**Action**: UPDATE

**Add new function:**

```typescript
/**
 * Determines if the current execution context is interactive terminal usage
 * vs CI/automation environment that benefits from retry reliability
 */
export function isInteractiveContext(): boolean {
  // Not interactive if no TTY (piped/redirected input)
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    return false;
  }
  
  // Common CI environment indicators
  const ciEnvironments = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'JENKINS_URL',
    'BUILDKITE',
    'CIRCLECI',
    'TRAVIS',
    'APPVEYOR'
  ];
  
  // Not interactive if running in CI
  if (ciEnvironments.some(env => process.env[env])) {
    return false;
  }
  
  return true;
}
```

**Why**: Provides reliable detection of interactive vs automation contexts using established patterns from the codebase.

---

### Step 2: Modify withDefaults to Use Context-Aware Logic

**File**: `packages/cli/src/cli.ts`  
**Lines**: 175-185  
**Action**: UPDATE

**Current code:**

```typescript
function withDefaults(config: CIAConfig): CIAConfig {
  return {
    mode: config.mode ?? 'lazy',
    format: config.format ?? 'default',
    provider: config.provider ?? 'codex',
    retries: config.retries ?? 1,
    'retry-backoff': config['retry-backoff'] ?? true,
    timeout: config.timeout ?? 60,
    'log-level': config['log-level'] ?? 'INFO',
    ...config,
  };
}
```

**Required change:**

```typescript
import { isInteractiveContext } from './shared/config/loader.js';

function withDefaults(config: CIAConfig): CIAConfig {
  // Smart default: 0 retries for interactive usage, 1 for CI/automation
  const defaultRetries = isInteractiveContext() ? 0 : 1;
  
  return {
    mode: config.mode ?? 'lazy',
    format: config.format ?? 'default',
    provider: config.provider ?? 'codex',
    retries: config.retries ?? defaultRetries,
    'retry-backoff': config['retry-backoff'] ?? true,
    timeout: config.timeout ?? 60,
    'log-level': config['log-level'] ?? 'INFO',
    ...config,
  };
}
```

**Why**: Preserves explicit user configuration while providing context-appropriate defaults.

---

### Step 3: Add Comprehensive Test Coverage

**File**: `packages/cli/tests/cli.test.ts`  
**Action**: UPDATE

**Test cases to add:**

```typescript
describe('Context-aware retry defaults', () => {
  it('should default to 0 retries in interactive context', () => {
    // Mock interactive environment
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true);
    delete process.env.CI;
    
    const config = withDefaults({});
    expect(config.retries).toBe(0);
  });

  it('should default to 1 retry in CI context', () => {
    // Mock CI environment
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true);
    process.env.CI = 'true';
    
    const config = withDefaults({});
    expect(config.retries).toBe(1);
    
    delete process.env.CI;
  });

  it('should default to 1 retry in non-TTY context', () => {
    // Mock non-interactive (piped) environment
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(false);
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true);
    delete process.env.CI;
    
    const config = withDefaults({});
    expect(config.retries).toBe(1);
  });

  it('should preserve explicit retry configuration', () => {
    // Mock interactive environment
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.spyOn(process.stdout, 'isTTY', 'get').mockReturnValue(true);
    delete process.env.CI;
    
    const config = withDefaults({ retries: 5 });
    expect(config.retries).toBe(5);
  });
});
```

---

### Step 4: Update Help Documentation

**File**: `packages/cli/src/commands/help.ts`  
**Lines**: Around line 70-80  
**Action**: UPDATE

**Current help text around retries:**

```typescript
// Update options documentation section
```

**Add explanation:**

```typescript
console.log('');
console.log('Smart Defaults:');
console.log('  --retries    Defaults to 0 in interactive terminals for fast feedback');
console.log('               Defaults to 1 in CI/automation for reliability');
console.log('               Override with explicit --retries=N as needed');
```

**Why**: Users need to understand the new context-aware behavior.

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/commands/run.ts:18
// Pattern for TTY detection
const hasStdin = (process as any).stdin.isTTY === false;

// SOURCE: packages/cli/src/commands/run.ts:324  
// Pattern for stdin TTY check
} else if ((process as any).stdin.isTTY === false) {

// SOURCE: packages/cli/src/providers/index.ts:77-82
// Pattern for conditional feature enablement
if (
  config &&
  (config.retries !== undefined || config['contract-validation'] || config['retry-timeout'])
) {
  assistantChat = new ReliableAssistantChat(assistantChat, config);
}
```

---

## Edge Cases & Risks

| Risk/Edge Case                                  | Mitigation                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Breaking change for automation scripts         | Only change default for interactive TTY, preserve for automation    |
| CI environment detection misses some platforms | Check multiple common CI env vars, conservative fallback to retries=1 |
| User confusion about different defaults        | Clear documentation in help text and examples                       |
| Test environment inconsistency                  | Mock TTY/env state explicitly in tests                              |

---

## Validation

### Automated Checks

```bash
bun test packages/cli/tests/cli.test.ts
bun run type-check
bun run lint
```

### Manual Verification

1. Run `cia run "invalid command"` in interactive terminal - should fail fast (~21s vs ~33s previously)
2. Run same command with `--retries=1` - should use old behavior (~33s)
3. Verify CI environments still default to retries=1 for reliability
4. Test help command shows updated documentation

---

## Scope Boundaries

**IN SCOPE:**

- Context detection for interactive vs CI environments  
- Smart default retry values based on context
- Test coverage for new behavior
- Help documentation updates

**OUT OF SCOPE (do not touch):**

- ReliableAssistantChat wrapper logic (already works correctly)
- Explicit retry configuration handling (preserve existing behavior)  
- Other CLI performance optimizations (separate concern)
- Retry backoff/timeout logic (not related to defaults)

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-22T14:30:00Z  
- **Artifact**: `.claude/PRPs/issues/issue-47.md`