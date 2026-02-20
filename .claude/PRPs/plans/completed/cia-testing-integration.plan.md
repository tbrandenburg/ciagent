# Feature: CIA Testing and Integration Hardening (Phase 7.6)

## Summary

Build a high-signal testing and integration hardening pass for CIA Agent that validates MCP + Skills orchestration, provider contract compatibility, and reliability/performance behavior under CI constraints. The approach extends existing Vitest patterns (env-gated E2E/integration, contract tests, timing assertions, and Makefile-governed validation) instead of introducing a new test architecture.

## User Story

As a DevOps engineer integrating CIA into CI/CD
I want comprehensive, stable tests that verify provider compatibility, MCP/Skills orchestration, and performance budgets
So that I can upgrade and deploy with confidence without regressions or flaky pipelines.

## Problem Statement

Phase 7.5 introduced broad MCP + Skills functionality, but the current test surface has gaps and inconsistencies (duplicate E2E cases, contract validator/test-type drift risk, and no dedicated benchmark harness). This makes one-pass confidence in compatibility and runtime behavior weaker than required for the critical path to Phase 9.

## Solution Statement

Strengthen existing tests in-place: consolidate and de-duplicate integration coverage, extend contract assertions to match current `MessageChunk` evolution where appropriate, add deterministic performance assertions, and standardize validation through governed commands (`make validate-*`, `make ci-full`). Keep all changes aligned with current project conventions and dependency versions.

## Metadata

| Field | Value |
|------|-------|
| Type | ENHANCEMENT |
| Complexity | HIGH |
| Systems Affected | `packages/cli/tests`, `packages/cli/src/providers`, `vitest.config.ts`, `Makefile`, CI pre-push workflow |
| Dependencies | `vitest@^1.6.0` (installed, latest 4.0.18), `@modelcontextprotocol/sdk@^1.26.0` (installed/latest 1.26.0), `ai@^6.0.86` (installed, latest 6.0.94), `@openai/codex-sdk@^0.87.0` (installed, latest 0.104.0), `@anthropic-ai/claude-agent-sdk@^0.2.7` (installed, latest 0.2.49) |
| Estimated Tasks | 9 |
| **Research Timestamp** | **2026-02-20T11:35:00Z** |

---

## UX Design

### Before State

```
+------------------------------------------------------------------------------+
|                                BEFORE STATE                                  |
+------------------------------------------------------------------------------+
| Developer runs tests manually with partial confidence:                        |
|                                                                              |
|  change code -> run subset tests -> pass locally -> push                     |
|                                  |                                            |
|                                  v                                            |
|                     duplicated/uneven integration cases                        |
|                                  |                                            |
|                                  v                                            |
|                     occasional uncertainty on compatibility                    |
|                                                                              |
| USER_FLOW: Dev adds feature, runs vitest, relies on mixed test quality       |
| PAIN_POINT: Gaps/duplication reduce trust in one-pass CI success             |
| DATA_FLOW: provider chunks + MCP/Skills status not fully asserted end-to-end |
+------------------------------------------------------------------------------+
```

### After State

```
+------------------------------------------------------------------------------+
|                                 AFTER STATE                                  |
+------------------------------------------------------------------------------+
| Developer uses standardized, high-signal validation path:                     |
|                                                                              |
|  change code -> make validate-l1 -> make validate-l2 -> make ci-full         |
|                                      |                                        |
|                                      v                                        |
|                 consolidated integration + compatibility assertions            |
|                                      |                                        |
|                                      v                                        |
|                  reliable pass/fail signal for release decisions              |
|                                                                              |
| USER_FLOW: Dev follows governed commands and gets deterministic outcomes      |
| VALUE_ADD: Faster confidence, lower regression risk, cleaner CI triage        |
| DATA_FLOW: chunk contracts + status logs + error paths validated consistently |
+------------------------------------------------------------------------------+
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `packages/cli/tests/e2e-mcp-skills.test.ts` | Duplicate test blocks and redundant scenarios | Consolidated scenarios with unique intent | Clearer failure signals and easier maintenance |
| `packages/cli/tests/providers.contract.test.ts` | Base chunk-type checks only | Contract checks aligned to current provider output strategy | Better compatibility confidence across providers |
| `packages/cli/tests/providers.reliability.test.ts` | Timing checks exist but not tied to explicit budgets per workflow | Explicit performance budget tests per reliability path | Detects regressions in retry/backoff timing early |
| `Makefile` + CI usage | Validation levels exist but not emphasized for this phase | Phase tasks mapped to `validate-l1..l4` and `ci-full` | Repeatable local-to-CI behavior |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/tests/providers.contract.test.ts` | 1-330 | Existing provider contract matrix and overload compatibility pattern |
| P0 | `packages/cli/tests/providers.reliability.test.ts` | 57-432 | Retry/timeout/contract behavior and timing assertions pattern |
| P0 | `packages/cli/tests/e2e-mcp-skills.test.ts` | 16-389 | Env-gated integration flow for MCP + Skills with status assertions |
| P1 | `packages/cli/src/providers/types.ts` | 1-108 | Canonical chunk and interface types under test |
| P1 | `packages/cli/src/providers/contract-validator.ts` | 1-34 | Runtime contract gate currently enforced by reliability wrapper |
| P1 | `vitest.config.ts` | 1-23 | Global include/exclude/timeouts and 40% thresholds |
| P2 | `Makefile` | 47-75 | Governed validation sequence and gated integration execution |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [Vitest API](https://vitest.dev/api/#test-skipif) ✓ Current | `test.skipIf`, hooks, timeout API | Keep env-gated and timeout patterns current | 2026-02-20T11:27:00Z |
| [Vitest Config](https://vitest.dev/config/#coverage-thresholds) ✓ Current | Coverage thresholds and config model | Preserve/adjust threshold strategy safely | 2026-02-20T11:27:00Z |
| [MCP TS SDK docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md) ✓ Current | Stdio client transport pattern | Validate integration-test transport assumptions | 2026-02-20T11:26:00Z |
| [AI SDK Generating/Streaming Text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text#streamtext) ✓ Current | `streamText`, stream consumption, `onError` | Validate provider adapter streaming tests | 2026-02-20T11:27:00Z |
| [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) ✓ Current | minimatch ReDoS advisory | Security-aware dependency decisions in CI | 2026-02-20T11:28:00Z |

---

## Patterns to Mirror

**NAMING_CONVENTION:**
```typescript
// SOURCE: packages/cli/tests/providers.contract.test.ts:98
describe('providers contract', () => {
```

**ERROR_HANDLING:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:125
providerUnreliable: (provider: string, reason: string): CliError =>
  createError(
    ExitCode.LLM_EXECUTION,
    `Provider '${provider}' reliability issue`,
    reason,
    'Try switching providers or check provider service status'
  ),
```

**LOGGING_PATTERN:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:511
console.log(
  `[Status] MCP: ${connectedServers}/${serverCount} servers connected, ${toolCount} tools available`
);
```

**REPOSITORY_PATTERN (integration backend manager pattern):**
```typescript
// SOURCE: packages/cli/src/providers/mcp/manager.ts:74
const connectionPromises = Object.entries(mcpConfig)
  .filter(([_, config]) => config.enabled !== false)
  .map(([name, config]) => this.connectToServer(name, config));

await Promise.allSettled(connectionPromises);
```

**SERVICE_PATTERN (reliability wrapper test pattern):**
```typescript
// SOURCE: packages/cli/tests/providers.reliability.test.ts:103
it('should retry on transient failures', async () => {
  mockProvider.setShouldThrow(true, 'Network timeout', 2);
  mockProvider.setChunks([{ type: 'assistant', content: 'Success after retry' }]);
```

**TEST_STRUCTURE:**
```typescript
// SOURCE: packages/cli/tests/e2e-mcp-skills.test.ts:17
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
describe.skipIf(!runIntegrationTests)('E2E MCP + Skills + Codex Integration', () => {
```

---

## Current Best Practices Validation

**Security (Context + Advisory Verified):**

- [x] Current OWASP recommendations followed (input validation early, explicit error handling)
- [x] Recent advisories checked via `bun audit` (4 findings tracked)
- [x] Authentication/error-path tests are env-gated and explicit (no silent fallback)
- [x] Dependency freshness validated against registry (`npm view ... version`)

**Performance (Web + Existing Code Verified):**

- [x] Timing budgets asserted using deterministic thresholds (`<3000ms`, `<5000ms` existing pattern)
- [x] Retry tests keep backoff controlled for CI (`retry-backoff: false` in tests)
- [x] Existing `testTimeout` tuned to reliability suite behavior
- [x] No new heavyweight benchmark framework required (YAGNI)

**Community Intelligence:**

- [x] Active Vitest community issues reviewed (focus: CI behavior, config correctness)
- [x] Maintainer docs confirm `skipIf`, timeout, coverage-threshold usage
- [x] No conflicting guidance vs current env-gated integration pattern
- [x] Deprecated patterns avoided (do not rely on implicit/hidden test execution)

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `packages/cli/tests/e2e-mcp-skills.test.ts` | UPDATE | Remove duplicated test blocks; tighten scenario intent |
| `packages/cli/tests/providers.contract.test.ts` | UPDATE | Align contract expectations with current chunk strategy and interface coverage |
| `packages/cli/tests/providers.reliability.test.ts` | UPDATE | Expand deterministic performance/compatibility assertions |
| `packages/cli/tests/providers/mcp/reliability.test.ts` | UPDATE | Add integration-focused reliability edge cases |
| `packages/cli/tests/skills/integration.test.ts` | UPDATE | Add cross-feature scenarios and clear budgets |
| `packages/cli/tests/e2e.test.ts` | UPDATE | Keep smoke tests minimal but high-signal |
| `vitest.config.ts` | UPDATE (if needed) | Keep includes/timeouts/coverage coherent with revised suites |
| `Makefile` | UPDATE (if needed) | Ensure governed commands map cleanly to phase validation |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- New testing framework migration (e.g., Jest/Playwright overhaul) - out of scope for phase 7.6.
- Full synthetic benchmark platform for Raspberry Pi simulation - defer to dedicated benchmarking phase.
- Runtime feature changes to MCP/Skills behavior unless strictly required to make tests deterministic.

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: run static checks relevant to touched files; run focused tests first, then governed levels.

**Coverage Target for this phase**: keep global threshold >=40% and raise new/changed test module coverage to >=75% where practical.

### Task 1: Baseline and freeze current behavior

- **ACTION**: Capture current failure/success baseline for targeted suites.
- **IMPLEMENT**: Run current integration/contract/reliability tests and log flake points.
- **MIRROR**: Existing env-gated model in `packages/cli/tests/e2e.test.ts:10` and `packages/cli/tests/e2e-mcp-skills.test.ts:17`.
- **GOTCHA**: Avoid changing source logic before test baseline is recorded.
- **VALIDATE**: `make validate-l2`
- **TEST_PYRAMID**: No additional tests needed - baseline activity.

### Task 2: De-duplicate MCP+Skills E2E coverage

- **ACTION**: Update `packages/cli/tests/e2e-mcp-skills.test.ts`.
- **IMPLEMENT**: Remove duplicated `should handle Context7 MCP server startup gracefully` and duplicated Error Handling block; retain one canonical scenario per behavior.
- **MIRROR**: `describe.skipIf(!runIntegrationTests)` gating and status assertion style.
- **GOTCHA**: Keep graceful-failure expectations for missing auth/network.
- **VALIDATE**: `npx vitest --run packages/cli/tests/e2e-mcp-skills.test.ts`
- **TEST_PYRAMID**: Add critical integration journey check for MCP+Skills status emission (if reduced by dedupe).

### Task 3: Strengthen provider contract compatibility matrix

- **ACTION**: Update `packages/cli/tests/providers.contract.test.ts`.
- **IMPLEMENT**: Keep provider matrix broad, add explicit assertion notes for what chunk types are expected from wrapped providers in current architecture.
- **MIRROR**: `ALLOWED_CHUNK_TYPES` + `collectChunks` helper pattern.
- **GOTCHA**: Do not over-broaden allowed types unless runtime `contract-validator` policy also changes intentionally.
- **VALIDATE**: `npx vitest --run packages/cli/tests/providers.contract.test.ts`
- **TEST_PYRAMID**: Add one integration-oriented contract test for reliability wrapper + provider config path.

### Task 4: Expand reliability timing and retry determinism

- **ACTION**: Update `packages/cli/tests/providers.reliability.test.ts`.
- **IMPLEMENT**: Add scenario coverage for edge retry classes and keep deterministic budget assertions.
- **MIRROR**: Existing `Test Environment Optimization` block and disabled backoff config.
- **GOTCHA**: Avoid brittle wall-clock checks; use generous but meaningful thresholds.
- **VALIDATE**: `npx vitest --run packages/cli/tests/providers.reliability.test.ts`
- **TEST_PYRAMID**: Add integration-level reliability scenario for mixed transient/non-transient errors.

### Task 5: Harden MCP reliability integration tests

- **ACTION**: Update `packages/cli/tests/providers/mcp/reliability.test.ts`.
- **IMPLEMENT**: Add coverage around connection monitor lifecycle + recovery transitions relevant to orchestration.
- **MIRROR**: `MCPConnectionMonitor` and `TimeoutManager` describe blocks.
- **GOTCHA**: Keep tests unit-fast; no real network calls.
- **VALIDATE**: `npx vitest --run packages/cli/tests/providers/mcp/reliability.test.ts`
- **TEST_PYRAMID**: Add one integration check for monitor health summary consistency.

### Task 6: Tighten skills integration performance bounds

- **ACTION**: Update `packages/cli/tests/skills/integration.test.ts`.
- **IMPLEMENT**: Keep startup and multi-skill performance tests with explicit comments on acceptable CI variance.
- **MIRROR**: Existing `Performance` describe block.
- **GOTCHA**: Avoid too-tight thresholds that create CI flakes.
- **VALIDATE**: `npx vitest --run packages/cli/tests/skills/integration.test.ts`
- **TEST_PYRAMID**: Add one end-to-end skill discovery + run-command compatibility case.

### Task 7: Keep smoke tests lean and high-signal

- **ACTION**: Update `packages/cli/tests/e2e.test.ts` only if needed.
- **IMPLEMENT**: Ensure core smoke path remains: help, strict-schema guard, invalid provider, auth/config error path.
- **MIRROR**: Existing `runCLI` helper and env gating.
- **GOTCHA**: Do not expand smoke suite into long integration flow.
- **VALIDATE**: `RUN_E2E_TESTS=1 npx vitest --run packages/cli/tests/e2e.test.ts`
- **TEST_PYRAMID**: No additional tests needed - smoke purpose preserved.

### Task 8: Reconcile config/governed validation commands

- **ACTION**: Update `vitest.config.ts` and/or `Makefile` only if test changes require it.
- **IMPLEMENT**: Keep include paths, timeout, and coverage policy consistent with updated suites.
- **MIRROR**: Existing `validate-l1`..`validate-l4` sequence.
- **GOTCHA**: Keep CI runtime reasonable; avoid increasing global timeout unless justified.
- **VALIDATE**: `make validate-l1 && make validate-l2 && make validate-l3`
- **TEST_PYRAMID**: No additional tests needed - orchestration change only.

### Task 9: Full integration gate and stability pass

- **ACTION**: Execute full gated validation.
- **IMPLEMENT**: Run both default and gated suites to validate real integration wiring.
- **VALIDATE**: `make ci && make ci-full && make validate-l4`
- **FUNCTIONAL**: `./dist/cia --help && ./dist/cia --version`
- **TEST_PYRAMID**: Critical user journey validated via E2E + integration combined run.

---

## Testing Strategy

### Unit Tests to Write/Update

| Test File | Test Cases | Validates |
|----------|------------|-----------|
| `packages/cli/tests/providers.reliability.test.ts` | transient/non-transient retry paths, timeout budgets, Message[] behavior | reliability wrapper correctness |
| `packages/cli/tests/providers/mcp/reliability.test.ts` | connection monitor transitions, timeout manager lifecycle | MCP reliability primitives |
| `packages/cli/tests/providers.contract.test.ts` | provider matrix contract, overload compatibility, sessionId guarantees | cross-provider compatibility |

### Integration/E2E Tests to Write/Update

| Test File | Test Cases | Validates |
|----------|------------|-----------|
| `packages/cli/tests/e2e-mcp-skills.test.ts` | status emission, graceful failures, MCP+Skills coordination | orchestration integration |
| `packages/cli/tests/skills/integration.test.ts` | discovery, malformed skill handling, performance constraints | skills subsystem integration |
| `packages/cli/tests/e2e.test.ts` | binary smoke and guardrails | CLI-level health |

### Edge Cases Checklist

- [ ] Missing Codex auth while MCP/Skills status still emits
- [ ] MCP server startup failure with graceful degradation
- [ ] Duplicate/invalid chunk type under contract validation
- [ ] Retry exhaustion with deterministic error output
- [ ] Empty/invalid Message[] input path behavior
- [ ] Duplicate integration test definitions eliminated

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
```

**EXPECT**: Exit 0, no lint/type errors.

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make validate-l4
```

**EXPECT**: Binary builds and `--help`/`--version` execute.

### Level 3: UNIT_TESTS

```bash
npx vitest --run packages/cli/tests/providers.contract.test.ts packages/cli/tests/providers.reliability.test.ts packages/cli/tests/providers/mcp/reliability.test.ts
```

**EXPECT**: All targeted suites pass.

### Level 4: FULL_SUITE

```bash
make validate-l3 && make ci-full
```

**EXPECT**: Full suite and gated integration/E2E pass.

### Level 5: BROWSER_VALIDATION (if UI changes)

Not applicable - CLI-only phase.

### Level 6: CURRENT_STANDARDS_VALIDATION

```bash
bun audit && npm view vitest version && npm view @modelcontextprotocol/sdk version && npm view ai version
```

**EXPECT**: Advisories known/documented; dependency versions resolvable.

### Level 7: MANUAL_VALIDATION

1. Build binary with `make build`.
2. Run `RUN_E2E_TESTS=1 npx vitest --run packages/cli/tests/e2e.test.ts`.
3. Run `RUN_INTEGRATION_TESTS=1 npx vitest --run packages/cli/tests/e2e-mcp-skills.test.ts`.
4. Confirm status logs include `[Status] MCP:` and `[Status] Skills:` paths under expected scenarios.

---

## Acceptance Criteria

- [ ] All phase 7.6 functionality covered by stable, non-duplicative tests
- [ ] Level 1-3 validation commands pass with exit 0
- [ ] No new flaky tests introduced (timing tests remain deterministic)
- [ ] Code mirrors existing test patterns and naming conventions
- [ ] No regressions in provider contract and reliability behavior
- [ ] Integration tests remain opt-in via env gating
- [ ] Current best-practice checks documented and current
- [ ] Known dependency advisories documented with mitigation path

---

## Completion Checklist

- [ ] Tasks executed in dependency order
- [ ] Focused tests run after each task
- [ ] `make validate-l1` passes
- [ ] `make validate-l2` passes
- [ ] `make validate-l3` passes
- [ ] `make ci-full` passes
- [ ] `make validate-l4` passes
- [ ] Standards/security verification refreshed before merge

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 3 documentation queries (Vitest, MCP TS SDK, Vercel AI SDK)
**Web Intelligence Sources**: 6 (Vitest docs, AI SDK docs, GitHub advisory, StackOverflow vitest active feed, OWASP Input Validation, OWASP NodeJS Security)
**Last Verification**: 2026-02-20T11:28:00Z
**Security Advisories Checked**: 4 (`bun audit` findings: minimatch, ajv, esbuild, hono)
**Deprecated Patterns Avoided**: hidden fallback behavior in tests, ungated integration execution, over-broad flaky time assertions

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Timing-based tests become flaky in shared CI | MEDIUM | HIGH | Keep coarse thresholds, disable backoff in test config, isolate hot paths |
| Contract tests diverge from runtime validator policy | MEDIUM | HIGH | Update tests and `contract-validator` policy in lockstep when intentional |
| Integration tests fail due to external auth/network assumptions | HIGH | MEDIUM | Keep env gating and assert graceful-failure outputs, not external availability |
| Advisory backlog delays releases | MEDIUM | MEDIUM | Track `bun audit` findings; prioritize high severity and dependency updates |

---

## Notes

Architecture invariants for this phase:

1. Test gating remains explicit: E2E/integration run only when env flags are set.
2. Provider contract remains fail-loud: invalid chunk contract surfaces as error, not fallback.
3. Reliability behavior remains deterministic in tests: retries/timeouts are configured for predictable CI runtime.
4. CLI status emission remains observable even when provider auth/network fails.

### Current Intelligence Considerations

- Vitest docs confirm `skipIf` and timeout APIs remain current and aligned with repository usage.
- MCP SDK patterns continue to center on stdio/HTTP transports and explicit client lifecycle management.
- AI SDK streaming guidance emphasizes consuming streams and explicit error callbacks; this informs future stream-related test evolution.
- Security posture should include immediate attention to high-severity minimatch ReDoS advisory reported by `bun audit`.
