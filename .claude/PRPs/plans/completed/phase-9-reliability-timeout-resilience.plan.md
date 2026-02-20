# Feature: Phase 9 Reliability & Timeout Resilience

## Summary

Reframe PRD Phase 9 from user-facing streaming UX into CI-safe execution resilience for `cia run`: prevent hangs, enforce deterministic timeout behavior while consuming `AsyncGenerator<ChatChunk>`, and cap unbounded output memory in a fail-loud way. The implementation stays surgical by reusing existing retry/error patterns and avoiding interface overhauls.

## User Story

As a DevOps engineer running `cia` in CI/CD pipelines
I want provider execution to fail fast on hangs and timeout consistently
So that workflows are deterministic, resilient, and do not stall runners.

## Problem Statement

Current timeout handling in `runCommand` only checks an abort flag inside the `for await` loop. If the provider hangs before the next chunk is yielded, the loop can block and the command may not fail promptly. Assistant output aggregation is also unbounded (`assistantChunks.push(...)`), which can overuse memory in long responses.

## Solution Statement

Add a low-complexity guardrail layer in the `run` command execution path to enforce: (1) hard overall timeout, (2) per-next-chunk stall detection, and (3) bounded assistant output accumulation. Keep `IAssistantChat` intact, reuse `CommonErrors.timeout` and existing exit code mappings, and expand tests with fake-timer-driven timeout scenarios.

## Metadata

| Field                  | Value |
| ---------------------- | ----- |
| Type                   | ENHANCEMENT |
| Complexity             | MEDIUM |
| Systems Affected       | CLI run command, provider reliability wrapper, config validation, help text, tests |
| Dependencies           | Existing deps only (`p-retry@7.1.1`, `vitest@1.6.0`, Node/Bun AbortController APIs) |
| Estimated Tasks        | 8 |
| **Research Timestamp** | **2026-02-20T16:30:00Z** |

---

## UX Design

### Before State
```
┌──────────────┐      ┌─────────────────────┐      ┌──────────────────────┐
│ CI workflow  │ ───► │ cia run             │ ───► │ provider.sendQuery() │
└──────────────┘      └─────────────────────┘      └──────────────────────┘
                               │                               │
                               │ for await chunk loop          │
                               ▼                               ▼
                        ┌───────────────┐              ┌───────────────────┐
                        │ timeout flag  │              │ may stall between │
                        │ checked only  │              │ yields indefinitely│
                        │ on chunk recv │              └───────────────────┘
                        └───────────────┘
                               │
                               ▼
                        ┌───────────────────┐
                        │ unbounded in-memory│
                        │ assistantChunks[]  │
                        └───────────────────┘

USER_FLOW: run -> consume chunks -> timeout only observed when loop iterates
PAIN_POINT: hangs can outlive timeout; memory growth is unbounded
DATA_FLOW: provider chunks -> console/output-file -> joined assistantChunks
```

### After State
```
┌──────────────┐      ┌─────────────────────┐      ┌──────────────────────┐
│ CI workflow  │ ───► │ cia run             │ ───► │ guarded consumption  │
└──────────────┘      └─────────────────────┘      └──────────────────────┘
                               │                               │
                               │                               ├─ hard deadline timeout
                               │                               ├─ next-chunk stall timeout
                               │                               └─ assistant output byte cap
                               ▼
                     ┌───────────────────────────┐
                     │ fail loud + mapped errors │
                     │ ExitCode.TIMEOUT / EXEC   │
                     └───────────────────────────┘

USER_FLOW: run -> guarded chunk consumption -> deterministic success/failure in bounded time
VALUE_ADD: no silent hang, bounded memory, predictable CI behavior
DATA_FLOW: provider chunks -> guardrail checks -> stdout/file/error mapping
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `cia run` long provider stall | may block until external job timeout | exits with timeout code and actionable message | Faster failure and recoverable pipelines |
| `cia run` very large output | unlimited `assistantChunks` growth | explicit bounded-size failure | Prevents memory blowups in runners |
| `cia run` timeout semantics | timeout observed only while iterating | timeout enforced around chunk wait path | Consistent timeout behavior |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/commands/run.ts` | 39-163 | Current timeout path and chunk-consumption loop |
| P0 | `packages/cli/src/providers/reliability.ts` | 16-131 | Existing retry + fail-loud error chunk pattern |
| P1 | `packages/cli/src/providers/mcp/reliability.ts` | 63-119 | Existing `withTimeout` + retry composition pattern |
| P1 | `packages/cli/src/shared/errors/error-handling.ts` | 93-131 | Canonical execution/timeout error construction |
| P1 | `packages/cli/src/shared/validation/validation.ts` | 106-116 | Timeout/retry numeric validation conventions |
| P2 | `packages/cli/tests/commands/run.test.ts` | 30-109 | Existing run command unit test style |
| P2 | `packages/cli/tests/providers.reliability.test.ts` | 106-220 | Retry behavior testing style and expectations |
| P2 | `packages/cli/tests/providers/mcp/reliability.test.ts` | 18-131 | Fake-timer timeout/retry test patterns |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [p-retry README](https://github.com/sindresorhus/p-retry#api) ✓ Current | `AbortError`, `maxRetryTime`, `signal`, `unref` | Align retry cancellation and bounded retry duration behavior | 2026-02-20T16:24:00Z |
| [Node.js Globals](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay) ✓ Current | `AbortSignal.timeout`, `AbortSignal.any` | Robust cancellation/timeout composition guidance | 2026-02-20T16:24:00Z |
| [Node.js Timers Promises](https://nodejs.org/api/timers.html#timerspromisessettimeoutdelay-value-options) ✓ Current | abortable timeout waits | Safer timeout race patterns for async waits | 2026-02-20T16:26:00Z |
| [Vitest Mocking Timers](https://vitest.dev/guide/mocking/timers) ✓ Current | `vi.useFakeTimers`, `vi.advanceTimersByTime` | Deterministic timeout tests without slow sleeps | 2026-02-20T16:24:00Z |
| [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) ✓ Current | minimatch ReDoS advisory | Track dependency risk context during this phase | 2026-02-20T16:26:00Z |
| [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) ✓ Current | esbuild dev server CORS advisory | Track transitive tooling risk context | 2026-02-20T16:26:00Z |

---

## Patterns to Mirror

**NAMING_CONVENTION:**
```typescript
// SOURCE: packages/cli/src/providers/mcp/reliability.ts:63-76
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeout: NodeJS.Timeout;
  return Promise.race([
    promise.then(result => {
      clearTimeout(timeout);
      return result;
    }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
}
```

**ERROR_HANDLING:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:101-107
timeout: (duration: number): CliError =>
  createError(
    ExitCode.TIMEOUT,
    `Operation timed out after ${duration}s`,
    'The AI provider took too long to respond',
    'Try increasing --timeout or check your network connection'
  ),
```

**LOGGING_PATTERN:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:58-61
console.log(
  '[Status] Warning: Status emission failed:',
  error instanceof Error ? error.message : String(error)
);
```

**REPOSITORY_PATTERN (provider wrapper composition):**
```typescript
// SOURCE: packages/cli/src/providers/index.ts:58-61
if (config && (config.retries || config['contract-validation'] || config['retry-timeout'])) {
  assistantChat = new ReliableAssistantChat(assistantChat, config);
}
```

**SERVICE_PATTERN (chunk consumption):**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:69-77
for await (const chunk of assistant.sendQuery(enhancedPrompt, process.cwd())) {
  if (abortController.signal.aborted) {
    throw new Error(`Operation timed out after ${timeoutSeconds} seconds`);
  }

  if (chunk.type === 'assistant' && chunk.content) {
    assistantChunks.push(chunk.content);
```

**TEST_STRUCTURE:**
```typescript
// SOURCE: packages/cli/tests/providers/mcp/reliability.test.ts:24-31
test('rejects when promise exceeds timeout', async () => {
  const slowPromise = new Promise(resolve => setTimeout(() => resolve('too late'), 200));

  await expect(withTimeout(slowPromise, 100)).rejects.toThrow(
    'Operation timed out after 100ms'
  );
});
```

---

## Current Best Practices Validation

**Security (Context + Advisory Verified):**

- [x] Current OWASP-aligned fail-loud behavior maintained (no silent fallback for execution path)
- [x] Recent CVE/GHSA advisories checked (`minimatch`, `esbuild`)
- [x] Authentication/config errors remain separated from timeout/exec failures
- [x] Input validation remains strict for timeout/retries

**Performance (Web Intelligence Verified):**

- [x] Timeout/cancellation uses native Abort APIs (no heavy dependency)
- [x] Avoids full-response buffering growth by planned byte cap guard
- [x] Retry logic remains bounded (`retries`, `retry-timeout`, optional `maxRetryTime` style behavior)
- [x] Test strategy uses fake timers to keep CI fast

**Community Intelligence:**

- [x] p-retry maintainers recommend `AbortError` for non-retryable failures and `signal` for cancellation
- [x] Vitest maintainers recommend fake timers for timer-heavy code
- [x] No contradictory maintainer guidance found for AsyncGenerator timeout guards
- [x] No deprecated APIs required by planned approach

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `packages/cli/src/commands/run.ts` | UPDATE | Add deterministic guardrail consumption around `sendQuery` loop |
| `packages/cli/src/providers/reliability.ts` | UPDATE | Optional: align retry timeout semantics and avoid full buffering behavior conflicts |
| `packages/cli/src/shared/validation/validation.ts` | UPDATE | Validate any newly introduced reliability guard config knobs (if added) |
| `packages/cli/src/commands/help.ts` | UPDATE | Document reliability semantics clearly for CI users |
| `packages/cli/tests/commands/run.test.ts` | UPDATE | Add timeout stall + output cap scenarios |
| `packages/cli/tests/providers.reliability.test.ts` | UPDATE | Ensure wrapper behavior remains compatible under timeout guards |
| `packages/cli/tests/providers/mcp/reliability.test.ts` | UPDATE | Mirror timeout helper expectations and edge cases |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- New interactive/partial streaming UX modes (`--verbose thinking stream`, token-by-token UX tuning)
- Provider interface redesign (`IAssistantChat` overload expansion for cancellation contexts)
- New persistence/session features
- New external dependencies for resilience (must use existing platform + deps)

---

## Architecture Invariants

- `ia-chat-contract`: `IAssistantChat.sendQuery(...) => AsyncGenerator<ChatChunk>` stays unchanged.
- `fail-loud`: execution path must return explicit non-zero exit code for timeout/stall/cap breach.
- `bounded-runtime`: every run has deterministic upper bound from configured timeout guards.
- `bounded-memory`: assistant aggregation must not grow without explicit cap.
- `idempotent-retry`: retries only for retryable failures; auth/contract failures remain non-retryable.

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: build, functionally test, then run unit tests with coverage enabled using governed commands.

**Coverage Target for this phase**: >=60% on touched modules, while keeping suite lean.

### Task 1: UPDATE `packages/cli/src/commands/run.ts` (guarded chunk consumption)

- **ACTION**: Add a small internal guard function for chunk iteration with hard timeout + stall timeout.
- **IMPLEMENT**: Replace direct `for await` loop with guarded `next()` race that can fail even when provider does not yield.
- **MIRROR**: `packages/cli/src/providers/mcp/reliability.ts:63-76` (`withTimeout` pattern)
- **IMPORTS**: Prefer existing globals; if needed use `node:timers/promises` only.
- **GOTCHA**: Existing abort flag check in loop (`run.ts:70-73`) does not trigger if loop never advances.
- **CURRENT**: Node `AbortSignal.timeout` + timers promises cancellation guidance.
- **VALIDATE**: `make validate-l1 && npx vitest --run packages/cli/tests/commands/run.test.ts`
- **FUNCTIONAL**: `bun packages/cli/src/cli.ts run "ping" --provider codex --timeout 1`
- **TEST_PYRAMID**: Add integration-like unit tests in command layer for stalled generator behavior.

### Task 2: UPDATE `packages/cli/src/commands/run.ts` (bounded assistant accumulation)

- **ACTION**: Enforce max aggregated assistant output bytes.
- **IMPLEMENT**: Track byte size while collecting chunks and fail with execution error on cap breach.
- **MIRROR**: `packages/cli/src/providers/tools/bash.ts:30` (`MAX_BUFFER` guardrail intent)
- **GOTCHA**: Preserve current JSON output behavior (`structuredOutput.response`) when within bounds.
- **CURRENT**: CI robustness best practice: cap untrusted output size.
- **VALIDATE**: `make validate-l1 && npx vitest --run packages/cli/tests/commands/run.test.ts`
- **TEST_PYRAMID**: Add test for cap breach and expected exit code/message.

### Task 3: UPDATE `packages/cli/src/providers/reliability.ts` (timeout semantics alignment)

- **ACTION**: Keep retries bounded in wall-clock terms and ensure non-retryable timeout categorization remains explicit.
- **IMPLEMENT**: Align current p-retry options with documented cancellation/bounding usage without changing public interface.
- **MIRROR**: `packages/cli/src/providers/reliability.ts:30-110` and p-retry `AbortError` pattern.
- **GOTCHA**: Current wrapper buffers all chunks before yielding (`reliability.ts:32`); avoid increasing memory pressure.
- **CURRENT**: p-retry docs: `AbortError`, `signal`, `maxRetryTime`.
- **VALIDATE**: `make validate-l1 && npx vitest --run packages/cli/tests/providers.reliability.test.ts`
- **TEST_PYRAMID**: Extend retry tests for bounded timeout behavior.

### Task 4: UPDATE `packages/cli/src/shared/validation/validation.ts` and `packages/cli/src/commands/help.ts`

- **ACTION**: Ensure reliability constraints are documented and validated consistently.
- **IMPLEMENT**: If new guard knobs are introduced, validate as positive numbers and document under RELIABILITY.
- **MIRROR**: `validation.ts:106-116` and `help.ts:52-56`
- **GOTCHA**: Do not introduce options that duplicate existing `--timeout` semantics unless strictly necessary.
- **VALIDATE**: `make validate-l1 && npx vitest --run packages/cli/tests/config/validation.test.ts`
- **TEST_PYRAMID**: Add/adjust validation tests only where behavior changes.

### Task 5: UPDATE `packages/cli/tests/commands/run.test.ts` (timeout resilience scenarios)

- **ACTION**: Add deterministic tests for stalled generator, hard timeout, and output cap.
- **IMPLEMENT**: Use fake timers where possible; keep tests fast.
- **MIRROR**: `providers/mcp/reliability.test.ts:18-31` timeout assertion style.
- **CURRENT**: Vitest fake timers guidance.
- **VALIDATE**: `npx vitest --run packages/cli/tests/commands/run.test.ts --coverage`
- **TEST_PYRAMID**: Critical user journey test: `cia run` exits with timeout code instead of hanging.

### Task 6: UPDATE provider reliability tests

- **ACTION**: Preserve existing retry contract while adding timeout-bound assertions.
- **IMPLEMENT**: Extend `packages/cli/tests/providers.reliability.test.ts` with bounded-time assertions similar to existing duration checks.
- **MIRROR**: `providers.reliability.test.ts:205-219`
- **VALIDATE**: `npx vitest --run packages/cli/tests/providers.reliability.test.ts --coverage`
- **TEST_PYRAMID**: Integration-style wrapper tests, no E2E expansion needed.

### Task 7: FULL VALIDATION PASS

- **ACTION**: Run governed validation levels end-to-end.
- **VALIDATE**: `make validate-all`
- **FUNCTIONAL**:
  - `./dist/cia --help`
  - `./dist/cia run "health check" --provider codex --timeout 2`
- **TEST_PYRAMID**: No additional tests; verify no regressions.

### Task 8: SECURITY + CURRENCY RE-CHECK BEFORE MERGE

- **ACTION**: Re-check advisories and docs freshness right before implementation merge.
- **VALIDATE**:
  - `bun audit`
  - Re-open links in "Current External Documentation"
- **TEST_PYRAMID**: N/A.

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
|-----------|------------|-----------|
| `packages/cli/tests/commands/run.test.ts` | stall before next yield, hard timeout triggers code 5, output-cap breach | Run command resilience |
| `packages/cli/tests/providers.reliability.test.ts` | retry bounded in time, non-retryable timeout paths | Wrapper reliability semantics |
| `packages/cli/tests/providers/mcp/reliability.test.ts` | helper parity for timeout + retry semantics | Utility correctness |

### Edge Cases Checklist

- [ ] Provider yields no chunks and no error
- [ ] Provider yields one chunk then stalls forever
- [ ] Timeout occurs exactly at boundary
- [ ] Output cap reached mid-stream
- [ ] Provider emits `error` chunk before timeout
- [ ] Auth/config failures remain non-retryable and not misclassified as timeout

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
```

**EXPECT**: Exit 0, lint and type-check pass.

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make validate-l4
```

**EXPECT**: Binary builds; help/version run.

### Level 3: UNIT_TESTS

```bash
npx vitest --run packages/cli/tests/commands/run.test.ts --coverage
```

**EXPECT**: New resilience tests pass with module coverage on touched files.

### Level 4: FULL_SUITE

```bash
make validate-l3
```

**EXPECT**: Full tests and build succeed.

### Level 4: DATABASE_VALIDATION (if schema changes)

Not applicable.

### Level 5: BROWSER_VALIDATION (if UI changes)

Not applicable.

### Level 6: CURRENT_STANDARDS_VALIDATION

Use Context7 + web references in this plan to confirm:

- [ ] Timeout/cancellation APIs are still current
- [ ] p-retry patterns are still current
- [ ] No deprecations introduced

### Level 7: MANUAL_VALIDATION

1. Run `cia run` with intentionally low timeout and verify fast timeout exit code 5.
2. Run `cia run` with normal timeout and verify successful output path unchanged.
3. Simulate oversized assistant response in tests and verify fail-loud behavior.

---

## Acceptance Criteria

- [ ] `cia run` cannot hang indefinitely when provider stops yielding
- [ ] Timeout failures consistently map to `ExitCode.TIMEOUT` (5)
- [ ] Assistant response aggregation is explicitly size-bounded
- [ ] Existing provider interfaces and command UX remain backward compatible
- [ ] Level 1-3 validation commands pass
- [ ] Implementation mirrors existing error/retry/test patterns
- [ ] No new dependencies added
- [ ] Security/advisory checks reviewed at implementation time

---

## Completion Checklist

- [ ] Tasks executed in dependency order
- [ ] Each task validated immediately
- [ ] `make validate-l1` passes
- [ ] `make validate-l3` passes
- [ ] `make validate-l4` passes
- [ ] New timeout resilience tests added and passing
- [ ] Documentation/help text updated if behavior/options changed
- [ ] Advisory check (`bun audit`) re-run before completion

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 6 (3 resolve + 3 query)
**Web Intelligence Sources**: 6
**Last Verification**: 2026-02-20T16:26:00Z
**Security Advisories Checked**: 4 (`bun audit` findings + 2 GHSA pages)
**Deprecated Patterns Avoided**: polling-only timeout checks inside loop, unbounded output accumulation, interface over-expansion for cancellation

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Timeout guard causes false positives on very slow providers | MEDIUM | MEDIUM | Keep default aligned with existing `--timeout`; add boundary tests |
| New guard breaks expected chunk handling order | LOW | MEDIUM | Preserve chunk processing order and mirror current loop semantics |
| Retry/timeout interplay produces double-wrapped errors | MEDIUM | MEDIUM | Normalize via existing `CommonErrors.timeout/executionFailed` mapping |
| Security issues in transitive tooling deps persist | MEDIUM | LOW | Track via `bun audit`; defer unrelated dependency upgrades to dedicated hardening phase |

---

## Notes

This plan intentionally keeps Phase 9 scoped to CI reliability rather than streaming UX. Existing PRD Phase 9 title remains for phase sequencing, but implementation objective is a resilience-focused capability gate suitable for non-interactive runners.

### Current Intelligence Considerations

- `p-retry@7.1.1` is current (verified), and its docs reinforce `AbortError`/`signal` usage for cancellation.
- `vitest` latest is `4.0.18` while repo pins `^1.6.0`; plan stays on existing major to avoid unrelated migration risk.
- `@openai/codex-sdk` latest (`0.104.0`) is ahead of pinned `^0.87.0`; no provider SDK upgrades in this phase to keep scope surgical.
- `zod` latest matches pinned major (`4.3.6`), no action needed for this phase.
