# Investigation: e2e test suite misses critical run-path regressions (timeouts and masked provider errors)

**Issue**: #38 (https://github.com/tbrandenburg/ciagent/issues/38)
**Type**: ENHANCEMENT
**Investigated**: 2026-02-21T23:11:22+01:00

### Assessment

| Metric | Value | Reasoning |
| --- | --- | --- |
| Priority | HIGH | Two regressions in the default `cia run` path shipped recently (#36, #37), so missing coverage is directly affecting release safety for the primary user workflow. |
| Complexity | MEDIUM | The fix is mainly test-focused but spans multiple integration points (binary e2e harness, provider factory seam, and default run-path assertions) across 3-4 files. |
| Confidence | HIGH | The coverage gap is explicit in `packages/cli/tests/e2e.test.ts` and the default-path behaviors are traceable with concrete code and recent git history. |

---

## Problem Statement

The current e2e suite only validates smoke and failure preconditions, but it does not execute the default successful `cia run` path with deterministic provider outcomes. Because of that, regressions in timeout semantics (#36) and reliability error surfacing (#37) were not caught before runtime. The suite needs high-signal, deterministic run-path scenarios that exercise `main()` defaults, `runCommand` timeout behavior, and reliability-wrapped provider errors.

---

## Analysis

### Root Cause / Change Rationale

This is not a single logic defect in production code; it is a coverage-design gap in the e2e layer.

WHY 1: Why did timeout and masked-error regressions reach runtime?
→ Because e2e does not assert these behaviors in the default `cia run` path.
→ Evidence: `packages/cli/tests/e2e.test.ts:79` to `packages/cli/tests/e2e.test.ts:108` only tests help, strict schema validation, invalid provider, and missing auth.

WHY 2: Why do current e2e tests avoid default success/error run-path checks?
→ Because the binary harness is currently coupled to real provider auth/network and expects auth failure as a terminal behavior.
→ Evidence: `packages/cli/tests/e2e.test.ts:105` hard-asserts auth/config error for codex run.

WHY 3: Why is default-path reliability behavior important specifically?
→ Because `main()` defaults set `retries=1`, which activates reliability wrapping in the normal `run` path.
→ Evidence: `packages/cli/src/cli.ts:179` sets default retries; `packages/cli/src/providers/index.ts:59` wraps with `ReliableAssistantChat` when retries are defined.

WHY 4: Why can unit tests alone miss this?
→ Unit tests cover pieces (`runCommand`, `ReliableAssistantChat`) but not the full default binary/main execution path with default config wiring.
→ Evidence: deep coverage exists in `packages/cli/tests/commands/run.test.ts` and `packages/cli/tests/providers.reliability.test.ts`, while e2e remains smoke-only.

ROOT CAUSE: The e2e test harness has no deterministic provider seam for exercising default `cia run` success/timeout/non-retryable-error scenarios end-to-end, so the suite cannot assert the behaviors that regressed.

### Evidence Chain

WHY: e2e misses run-path regressions.
↓ BECAUSE: e2e cases are smoke/precondition checks only.
Evidence: `packages/cli/tests/e2e.test.ts:79` - `it('executes help successfully'...)`, `packages/cli/tests/e2e.test.ts:103` - `it('returns auth/config error when no local auth exists'...)`

↓ BECAUSE: default path includes reliability wrapper behavior that is not asserted in e2e.
Evidence: `packages/cli/src/cli.ts:179` - `retries: config.retries ?? 1,`
Evidence: `packages/cli/src/providers/index.ts:59` - wraps `ReliableAssistantChat` when retries are present.

↓ BECAUSE: timeout behavior is implemented in `runCommand`, but no binary/main-level regression checks verify boundary conditions.
Evidence: `packages/cli/src/commands/run.ts:73` - `const hardDeadline = Date.now() + timeoutMs;`
Evidence: `packages/cli/src/commands/run.ts:81` - `withTimeout(chunkIterator.next(), remainingMs, ...)`

↓ ROOT CAUSE: no deterministic e2e provider simulation for default run path.
Evidence: `packages/cli/tests/e2e.test.ts:105` codex auth failure is currently the only codex run assertion.

### Affected Files

| File | Lines | Action | Description |
| --- | --- | --- | --- |
| `packages/cli/tests/e2e.test.ts` | 12-109 | UPDATE | Expand from smoke-only into deterministic run-path regression coverage. |
| `packages/cli/src/providers/index.ts` | 15-77 | UPDATE | Add a tightly-scoped test seam so e2e can force deterministic provider behavior without real auth/network. |
| `packages/cli/src/providers/test-double.ts` | NEW | CREATE | Minimal test-only provider for success, timeout-boundary, and non-retryable error scenarios. |
| `packages/cli/tests/integration.test.ts` | 44-94 | UPDATE (optional but recommended) | Add `main()`-level default path assertions with provider seam to complement binary e2e. |

### Integration Points

- `packages/cli/src/cli.ts:154` routes `run` to `runCommand`.
- `packages/cli/src/commands/run.ts:46` calls `createAssistantChat(provider, config)`.
- `packages/cli/src/providers/index.ts:59` adds reliability wrapping based on defaults.
- `packages/cli/src/providers/reliability.ts:133` formats actionable reliability errors with details.
- `packages/cli/tests/e2e.test.ts:42` has the binary spawn harness to extend.

### Git History

- **Introduced**: `37fdefb` (2026-02-10) - "refactor(cli): streamline scaffold with codex/claude providers" (initial e2e smoke scaffold).
- **Reliability layer added**: `b200fec` (2026-02-11) - "feat(providers): implement provider reliability layer with retry logic and contract validation".
- **Recent regressions fixed**: `970e2e9` (2026-02-21) timeout semantics (#36), `76475c3` (2026-02-21) codex error detail surfacing (#37).
- **Implication**: The production fixes landed, but e2e still reflects early smoke scope and did not evolve to guard these regressions.

---

## Implementation Plan

### Step 1: Add deterministic provider seam for e2e only

**File**: `packages/cli/src/providers/index.ts`
**Lines**: around 15-57
**Action**: UPDATE

**Current code:**

```typescript
export async function createAssistantChat(
  provider: string,
  config?: CIAConfig
): Promise<IAssistantChat> {
  let assistantChat: IAssistantChat;

  // ...

  if (VERCEL_PROVIDERS.includes(provider)) {
    assistantChat = await VercelAssistantChat.create(provider, providerConfig, networkConfig);
  } else if (provider === 'codex') {
    assistantChat = await CodexAssistantChat.create(providerConfig);
  } else if (provider === 'claude') {
    assistantChat = await ClaudeAssistantChat.create(providerConfig, networkConfig);
  } else {
    throw new Error(`Unsupported provider: ${provider}...`);
  }
```

**Required change:**

```typescript
// Add a strict test-only branch before real provider construction:
// if (process.env.RUN_E2E_TESTS === '1' && process.env.CIA_E2E_SCENARIO) {
//   assistantChat = new TestDoubleAssistantChat(process.env.CIA_E2E_SCENARIO, process.env);
// } else { existing provider selection }
```

**Why**: Binary e2e currently cannot reach deterministic success/timeout/error scenarios without real codex auth/network; this seam allows full run-path assertions while remaining disabled in normal usage.

---

### Step 2: Implement minimal test-double provider

**File**: `packages/cli/src/providers/test-double.ts`
**Action**: CREATE

**Required change:**

```typescript
export class TestDoubleAssistantChat implements IAssistantChat {
  // scenarios:
  // - success: emits assistant chunk
  // - delay-then-success: waits N ms then emits assistant chunk
  // - nonretryable-model-error: emits error chunk containing model access message
  // - stall: never yields (to trigger timeout)
}
```

**Why**: Keep e2e deterministic and high-signal without adding external dependencies or broad refactors.

---

### Step 3: Expand binary e2e with default run-path regression scenarios

**File**: `packages/cli/tests/e2e.test.ts`
**Lines**: 79-109 plus new tests
**Action**: UPDATE

**Current code:**

```typescript
it('returns auth/config error when no local auth exists', async () => {
  if (!shouldRunE2ETests) return;
  const result = await runCLI(['run', 'Hello world', '--provider=codex', '--model=gpt-4']);
  expect(result.exitCode).toBe(3);
  expect(result.stderr).toContain('Authentication/configuration error');
});
```

**Required change:**

```typescript
it('runs default cia run success path with reliability defaults enabled', async () => {
  const result = await runCLI(['run', 'Hello world'], {
    env: { CIA_E2E_SCENARIO: 'success' },
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('ok-from-test-double');
});

it('does not consume timeout budget during setup before streaming', async () => {
  const result = await runCLI(['run', 'Hello world', '--timeout=0.05'], {
    env: { CIA_E2E_SCENARIO: 'setup-delay-success', CIA_E2E_SETUP_DELAY_MS: '80' },
  });
  expect(result.exitCode).toBe(0);
});

it('surfaces non-retryable provider detail in default run path', async () => {
  const result = await runCLI(['run', 'Hello world'], {
    env: { CIA_E2E_SCENARIO: 'nonretryable-model-error' },
  });
  expect(result.exitCode).toBe(4);
  expect(result.stderr).toContain('does not exist or you do not have access');
  expect(result.stderr).not.toContain('Provider failed after 1 retry attempts');
});
```

Also update `runCLI` helper to merge optional per-test env overrides.

**Why**: These directly map to issue #38 requested outcomes and protect #36/#37 behaviors in the default path.

---

### Step 4: Add focused main() integration regression assertions (recommended)

**File**: `packages/cli/tests/integration.test.ts`
**Action**: UPDATE

**Required change:**

```typescript
it('main() default run path keeps actionable reliability detail', async () => {
  // invoke main(['run', 'prompt']) with deterministic provider seam,
  // assert exit code and stderr detail content.
});
```

**Why**: Keeps fast feedback in normal test runs even when binary e2e lane is disabled locally.

---

### Step 5: Preserve existing unit patterns and assertions

**File**: `packages/cli/tests/commands/run.test.ts`
**Action**: UPDATE (minimal, if needed)

**Test cases to add (only if missing after e2e changes):**

```typescript
describe('runCommand timeout/error classification guards', () => {
  it('does not misclassify non-deadline provider errors as timeout', async () => {
    // thrown provider error contains incidental "timeout" wording but should map to LLM_EXECUTION
  });
});
```

**Why**: Provides a fast, deterministic guard for false-timeout wording regressions.

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/tests/e2e.test.ts:42-76
const runCLI = (args: string[], options: { cwd?: string } = {}) => {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(binaryPath, args, {
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          HOME: testDir,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // ...
    }
  );
};
```

```typescript
// SOURCE: packages/cli/tests/commands/run.test.ts:77-109
it('prints actionable provider detail when error chunk includes reliability + detail text', async () => {
  // ... assert detail text contains model access message
});
```

```typescript
// SOURCE: packages/cli/src/providers/index.ts:59-64
if (
  config &&
  (config.retries !== undefined || config['contract-validation'] || config['retry-timeout'])
) {
  assistantChat = new ReliableAssistantChat(assistantChat, config);
}
```

---

## Edge Cases & Risks

| Risk/Edge Case | Mitigation |
| --- | --- |
| Test seam leaks into production behavior | Gate strictly by `RUN_E2E_TESTS === '1'` plus explicit `CIA_E2E_SCENARIO`; otherwise follow existing provider construction path unchanged. |
| Flaky timeout assertions due timing jitter | Use bounded delays with margin (e.g., setup delay 80ms vs timeout 50ms only when setup should not count) and avoid brittle exact-duration checks. |
| Existing auth-failure smoke test becomes redundant/conflicting | Keep one auth-failure smoke test to preserve current contract; add new deterministic scenarios separately. |
| E2E lane too slow | Keep scenario count minimal and high-signal; avoid long sleeps and external network calls. |

---

## Validation

### Automated Checks

```bash
npm run type-check
npm run test -- packages/cli/tests/integration.test.ts packages/cli/tests/commands/run.test.ts
RUN_E2E_TESTS=1 npm run build && RUN_E2E_TESTS=1 npm run test -- packages/cli/tests/e2e.test.ts
npm run lint
```

### Manual Verification

1. Run the e2e suite with `RUN_E2E_TESTS=1` and confirm new scenarios execute without external auth/network dependencies.
2. Confirm default `cia run` in normal local usage (without e2e env vars) still follows existing provider behavior.

---

## Scope Boundaries

**IN SCOPE:**

- Add deterministic e2e coverage for default `cia run` success, timeout-boundary, and non-retryable error-detail surfacing.
- Add only the minimal provider seam needed to make binary e2e deterministic.

**OUT OF SCOPE (do not touch):**

- Reworking reliability retry policy or provider architecture beyond testability seam.
- Adding broad new provider features or changing user-facing CLI contract unrelated to issue #38.

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-21T23:11:22+01:00
- **Artifact**: `.claude/PRPs/issues/issue-38.md`
