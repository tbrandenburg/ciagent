# Feature: Testing and Benchmarks (Phase 10)

## Summary

Phase 10 hardens confidence in `cia` by expanding high-signal tests and adding repeatable benchmark execution for CLI overhead. It now explicitly integrates GitHub Issue #8 (`Binary Size Bloat`) from a performance-governance angle: measure and gate binary size regressions in CI while preserving startup targets. The implementation mirrors existing Vitest and CI patterns (env-gated heavy tests, explicit timing budgets, Makefile-governed validation), while adding a minimal benchmark harness deterministic enough for regression detection without destabilizing CI.

## User Story

As a DevOps engineer integrating `cia` in CI/CD
I want reliable correctness tests and reproducible performance benchmarks
So that I can trust automation outputs and prove overhead stays under target budgets.

## Problem Statement

The codebase has strong unit/feature coverage but no dedicated benchmark harness for startup overhead and no phase-owned path that enforces benchmark evidence in a repeatable way. It also lacks an automated size-regression guard for the compiled binary (`dist/cia`), despite Issue #8 reporting a 103MB artifact versus PRD goals. This leaves the PRD performance success signal only partially validated.

## Solution Statement

Add a benchmark lane and phase-focused test expansion using current repository conventions: Vitest for correctness and bounded timing assertions, env-gated integration/E2E tests, Makefile validation levels, and CI artifact retention. Include Issue #8 size governance by capturing binary-size metrics and enforcing configurable fail thresholds. Keep runtime-impacting checks optional in default CI and enabled in explicit benchmark/full modes.

## Metadata

| Field | Value |
| --- | --- |
| Type | ENHANCEMENT |
| Complexity | HIGH |
| Systems Affected | `packages/cli/tests`, `scripts/`, `Makefile`, `.github/workflows/ci.yml`, `docs/` |
| Dependencies | `vitest@^1.6.0`, `@vitest/coverage-v8@^1.6.0`, `bun@1.3.9`, optional `hyperfine@>=1.20.0` (external tool) |
| Estimated Tasks | 9 |
| **Research Timestamp** | **2026-02-21T01:20:00Z** |

---

## UX Design

### Issue Integration (Issue #8)

- **Issue**: `https://github.com/tbrandenburg/ciagent/issues/8`
- **In Scope for this plan**: benchmark and gate binary size + startup overhead together, publish artifacts, prevent regressions.
- **Out of Scope for this plan**: changing compile/package strategy to actually shrink binary (owned by Phase 11 implementation work).
- **Hand-off Contract**: Phase 10 produces evidence and guardrails; Phase 11 consumes those metrics to optimize build outputs.

### Before State

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                                BEFORE STATE                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Dev pushes code ──► make ci ──► lint/type-check/tests/build pass/fail      ║
║                                  │                                           ║
║                                  └── no dedicated benchmark artifact         ║
║                                                                              ║
║  USER_FLOW: run standard CI checks and infer performance informally          ║
║  PAIN_POINT: no first-class, repeatable startup-overhead benchmark lane      ║
║  DATA_FLOW: test logs + coverage only; no benchmark JSON/markdown outputs    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### After State

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                                 AFTER STATE                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Dev pushes code ──► make ci ──► standard checks                             ║
║                         │                                                    ║
║                         ├──► make benchmark (opt-in/full CI lane)            ║
║                         │        │                                            ║
║                         │        ├── startup/runtime samples                 ║
║                         │        ├── budget assertions                       ║
║                         │        └── benchmark artifact (json/md)            ║
║                         │                                                    ║
║                         └──► e2e/integration gates via env flags             ║
║                                                                              ║
║  USER_FLOW: run one command set for correctness + measurable overhead        ║
║  VALUE_ADD: objective regression detection and phase-level performance proof  ║
║  DATA_FLOW: logs + coverage + benchmark outputs retained as artifacts         ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes

| Location | Before | After | User Impact |
| --- | --- | --- | --- |
| `Makefile` | `validate-l1..l4` only | adds benchmark target(s) with env-gated execution | one governed entrypoint for perf checks |
| `.github/workflows/ci.yml` | CI + E2E only | benchmark job or conditional benchmark step | benchmark evidence in artifacts |
| `packages/cli/tests/` | timing assertions embedded in a few tests | dedicated benchmark/perf test surface + clear budgets | easier regression diagnosis |
| `docs/` | no phase 10 benchmark operation doc | benchmark runbook with thresholds and interpretation | faster contributor onboarding |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
| --- | --- | --- | --- |
| P0 | `packages/cli/tests/providers.reliability.test.ts` | 221-239 | Existing wall-clock budget assertion pattern |
| P0 | `packages/cli/tests/commands/run.test.ts` | 216-243 | Timeout handling with fake timers |
| P0 | `packages/cli/tests/e2e.test.ts` | 10-31 | Env-gated E2E pattern and binary lookup |
| P1 | `vitest.config.ts` | 7-20 | Global include/exclude and coverage thresholds |
| P1 | `Makefile` | 47-75 | Governed validation and CI-full conventions |
| P1 | `.github/workflows/ci.yml` | 48-99 | Existing CI job split + artifact upload |
| P2 | `packages/cli/src/utils/exit-codes.ts` | 4-25 | Canonical exit code assertions |
| P2 | `packages/cli/src/providers/contract-validator.ts` | 5-16 | Known chunk-type validation mismatch risk |

**Current External Documentation (Verified Live):**

| Source | Section | Why Needed | Last Verified |
| --- | --- | --- | --- |
| [Vitest Config](https://vitest.dev/config/#coverage) | coverage + timeouts + projects | align test/coverage config with current Vitest guidance (noting project stays on v1 line) | 2026-02-21T01:15:00Z |
| [Vitest v4 Announcement](https://vitest.dev/blog/vitest-4) | migration + reporter behavior changes | avoid accidentally using v4-only APIs in v1.6 project | 2026-02-21T01:16:00Z |
| [Bun Benchmarking](https://bun.sh/docs/project/benchmarking) | timing APIs + benchmark tools | choose robust CLI benchmarking method (`hyperfine`, `Bun.nanoseconds`) | 2026-02-21T01:14:00Z |
| [GitHub Actions Artifact Docs](https://docs.github.com/en/actions/tutorials/store-and-share-data#uploading-build-and-test-artifacts) | upload/download + retention | keep benchmark artifacts consistent with existing CI patterns | 2026-02-21T01:17:00Z |
| [GitHub Job Conditions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions#using-conditions-to-control-job-execution) | `jobs.<id>.if` semantics | gate benchmark-heavy jobs safely | 2026-02-21T01:18:00Z |
| [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | minimatch ReDoS advisory | account for transitive test tooling vulnerability risk | 2026-02-21T01:13:00Z |
| [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) | ajv ReDoS advisory | validate current pinned `ajv@8.18.0` is patched | 2026-02-21T01:19:00Z |

---

## Patterns to Mirror

**NAMING_CONVENTION:**

```typescript
// SOURCE: packages/cli/tests/commands/models.test.ts:14
describe('modelsCommand', () => {
  // command-level test suite naming
});
```

**ERROR_HANDLING / EXIT CODES:**

```typescript
// SOURCE: packages/cli/src/utils/exit-codes.ts:4-11
export const enum ExitCode {
  SUCCESS = 0,
  INPUT_VALIDATION = 1,
  SCHEMA_VALIDATION = 2,
  AUTH_CONFIG = 3,
  LLM_EXECUTION = 4,
  TIMEOUT = 5,
  GENERAL_ERROR = 6,
}
```

**TIMEOUT_TEST_PATTERN:**

```typescript
// SOURCE: packages/cli/tests/commands/run.test.ts:216-237
it('returns timeout exit code when provider stalls before next yield', async () => {
  vi.useFakeTimers();
  const runPromise = runCommand(['hello'], { provider: 'codex', timeout: 5 });
  await vi.advanceTimersByTimeAsync(5001);
  const exitCode = await runPromise;
  expect(exitCode).toBe(5);
});
```

**PERFORMANCE_BUDGET_PATTERN:**

```typescript
// SOURCE: packages/cli/tests/providers.reliability.test.ts:221-239
it('keeps retry behavior bounded in wall-clock time', async () => {
  const startTime = Date.now();
  // execute
  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(3000);
});
```

**E2E_GATING_PATTERN:**

```typescript
// SOURCE: packages/cli/tests/e2e.test.ts:10-25
const shouldRunE2ETests = process.env.RUN_E2E_TESTS === '1';
if (!shouldRunE2ETests) {
  console.log('Skipping E2E tests. Set RUN_E2E_TESTS=1 to run them.');
  return;
}
```

**LOGGING_PATTERN:**

```typescript
// SOURCE: packages/cli/src/commands/run.ts:555
console.log(
  `[Status] MCP: ${connectedServers}/${serverCount} servers connected, ${toolCount} tools available`
);
```

---

## Current Best Practices Validation

**Security (Context7/Web/Bun audit verified):**

- [x] Current advisory set reviewed (`bun audit` + GHSA pages)
- [x] `ajv@8.18.0` confirmed as patched version for CVE-2025-69873
- [x] Transitive risk noted for `minimatch` and `esbuild`; mitigation tracked in tasks
- [x] No new network-exposed surface added by benchmark harness design

**Performance (Context7/Web verified):**

- [x] Benchmark tool guidance aligns with Bun docs (`hyperfine` for CLI commands)
- [x] In-process precision timing (`Bun.nanoseconds` / `performance.now`) validated
- [x] Budgets encoded as tolerant CI thresholds to avoid flaky regressions
- [x] Heavy benchmarks remain opt-in/conditional in CI

**Community Intelligence:**

- [x] Vitest current docs and v4 changelog reviewed for API drift awareness
- [x] GitHub Actions artifact/conditions docs verified for job gating and retention
- [x] No conflicting external pattern found versus existing repo style
- [x] Deprecated pattern to avoid: forcing benchmark jobs on every PR without gates

---

## Files to Change

| File | Action | Justification |
| --- | --- | --- |
| `packages/cli/tests/benchmarks/cli-startup.test.ts` | CREATE | Dedicated startup overhead assertions and regression budget checks |
| `packages/cli/tests/integration/enterprise-network.test.ts` | CREATE | Phase-required enterprise network behavior verification |
| `scripts/benchmarks/run-cli-startup.sh` | CREATE | Repeatable CLI benchmark driver, suitable for local + CI |
| `scripts/benchmarks/collect-metrics.ts` | CREATE | Parse and normalize benchmark outputs to deterministic JSON |
| `packages/cli/tests/benchmarks/binary-size.test.ts` | CREATE | Issue #8 regression guard for `dist/cia` artifact size |
| `Makefile` | UPDATE | Add `benchmark` and `validate-bench` governed targets |
| `.github/workflows/ci.yml` | UPDATE | Add conditional benchmark lane + artifact upload |
| `package.json` | UPDATE | Add benchmark scripts integrated with governed workflow |
| `docs/benchmarks.md` | CREATE | Runbook: execution, thresholds, troubleshooting |
| `packages/cli/tests/providers.reliability.test.ts` | UPDATE | Align budget assertions and remove flaky timing assumptions |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- Full cross-platform benchmark matrix (Linux/macOS/Windows) in this phase; start with Ubuntu CI + local Linux parity.
- Complex external observability stack (Prometheus/Grafana); benchmark outputs remain file artifacts.
- Automatic dependency upgrade campaign; only security-impacting updates justified by failing advisories.
- Interactive benchmark dashboards; markdown/json artifacts only.

---

## Architecture Invariants

- Benchmark execution is **ephemeral** and stateless; no benchmark state persists beyond generated artifact files.
- Default CI path (`make ci`) remains **fast and deterministic**; expensive tests/benchmarks are explicit opt-in or separate job-gated.
- Exit-code semantics remain **unchanged** and assertions must use `ExitCode` constants or matching numeric canonical values.
- Test additions must preserve current include topology (`packages/cli/tests/**/*.test.ts`) and existing env-flag gating strategy.

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: run static checks first, then relevant tests, then benchmark lane if applicable.

### Task 1: Create benchmark test suite skeleton

- **ACTION**: CREATE `packages/cli/tests/benchmarks/cli-startup.test.ts`
- **IMPLEMENT**: baseline startup benchmark tests with bounded assertions and fixture command set (`--help`, `--version`)
- **MIRROR**: `packages/cli/tests/providers.reliability.test.ts:221-239`
- **GOTCHA**: avoid strict per-run timing assumptions; assert percentile/mean budget window, not single sample
- **CURRENT**: Bun benchmarking guidance recommends repeat runs and suitable tools for CLI timing
- **VALIDATE**: `npx vitest --run packages/cli/tests/benchmarks/cli-startup.test.ts`
- **TEST_PYRAMID**: Add integration-style benchmark assertions only; no E2E yet

### Task 2: Add enterprise network integration tests

- **ACTION**: CREATE `packages/cli/tests/integration/enterprise-network.test.ts`
- **IMPLEMENT**: verify proxy/CA env handling pathways and clear failures with invalid network env
- **MIRROR**: `packages/cli/tests/e2e-mcp-skills.test.ts:16-20` (env-gated heavy tests)
- **GOTCHA**: test should not require real corporate proxy; use controlled mocks/stubs
- **CURRENT**: job/resource-heavy tests must be gated (`RUN_INTEGRATION_TESTS=1`)
- **VALIDATE**: `RUN_INTEGRATION_TESTS=1 npx vitest --run packages/cli/tests/integration/enterprise-network.test.ts`
- **TEST_PYRAMID**: Add integration test coverage for network edge cases

### Task 3: Add benchmark runner script

- **ACTION**: CREATE `scripts/benchmarks/run-cli-startup.sh`
- **IMPLEMENT**: run benchmark command set with warmups; include binary size capture (`stat`/`du`) in output; prefer `hyperfine` if available; fallback to Bun timing script
- **MIRROR**: `packages/cli/tests/e2e.test.ts:42-77` process invocation style
- **GOTCHA**: stable shell quoting and deterministic output paths in CI workspace
- **CURRENT**: Bun docs recommend `hyperfine` for CLI command benchmarking
- **VALIDATE**: `bash scripts/benchmarks/run-cli-startup.sh`
- **FUNCTIONAL**: verify benchmark output file(s) produced under `coverage/` or `test-results/benchmarks/`

### Task 4: Add metrics normalization utility

- **ACTION**: CREATE `scripts/benchmarks/collect-metrics.ts`
- **IMPLEMENT**: parse benchmark raw output, emit normalized JSON with timestamp, command, runs, mean, p95, and binary size bytes
- **MIRROR**: existing TypeScript CLI utility style in `packages/cli/src/shared/*` (plain functions, fail-loud)
- **GOTCHA**: malformed input must fail loudly (non-zero exit) and print actionable error
- **CURRENT**: keep schema simple and stable for CI artifact consumers
- **VALIDATE**: `bun scripts/benchmarks/collect-metrics.ts --input test-results/benchmarks/raw.json --output test-results/benchmarks/summary.json`
- **TEST_PYRAMID**: Add unit tests for parser edge cases (missing fields, NaN values)

### Task 5: Wire governed commands

- **ACTION**: UPDATE `Makefile` and `package.json`
- **IMPLEMENT**: add `benchmark`, `validate-bench`, and script aliases that compose existing targets
- **MIRROR**: `Makefile:47-75` validation level pattern
- **GOTCHA**: default `make ci` must remain unchanged unless explicitly requested by phase acceptance updates
- **CURRENT**: preserve pre-push hook expectations (`make ci`)
- **VALIDATE**: `make help && make benchmark`
- **TEST_PYRAMID**: No new tests; command wiring validated functionally

### Task 6: Extend CI workflow with conditional benchmark lane

- **ACTION**: UPDATE `.github/workflows/ci.yml`
- **IMPLEMENT**: add benchmark step/job gated by condition (e.g. manual dispatch, nightly, or explicit input/env)
- **MIRROR**: `.github/workflows/ci.yml:67-99` separate E2E job pattern
- **GOTCHA**: benchmark job should upload artifacts even on failure (`if: always()`)
- **CURRENT**: use `jobs.<job_id>.if` for predictable skip semantics
- **VALIDATE**: `npx vitest --run && bun run build` locally + workflow lint check via dry-run if available
- **TEST_PYRAMID**: No additional tests; CI behavior validated via workflow execution

### Task 7: Stabilize timing-sensitive existing tests

- **ACTION**: UPDATE `packages/cli/tests/providers.reliability.test.ts`
- **IMPLEMENT**: adjust brittle thresholds or sampling strategy to reduce flaky failures under shared runners
- **MIRROR**: existing tolerant budget comments in `packages/cli/tests/skills/integration.test.ts:231-264`
- **GOTCHA**: do not inflate budgets so far that regressions become invisible
- **CURRENT**: CI timing budgets should tolerate host variance while still catching real regressions
- **VALIDATE**: `npx vitest --run packages/cli/tests/providers.reliability.test.ts`
- **TEST_PYRAMID**: Existing unit/integration layer refined; no new layer added

### Task 8: Document benchmark runbook

- **ACTION**: CREATE `docs/benchmarks.md`
- **IMPLEMENT**: commands, target budgets, artifact fields, interpretation guidance, common failure modes
- **MIRROR**: concise, task-oriented style in `README.md`
- **GOTCHA**: document that perf numbers are environment-relative; compare trend over absolute cross-host values
- **CURRENT**: include explicit note on optional `hyperfine` dependency
- **VALIDATE**: `make benchmark` commands in docs execute without undocumented prerequisites
- **TEST_PYRAMID**: No tests needed (documentation)

### Task 9: Full validation and acceptance evidence capture

- **ACTION**: RUN full validation levels and collect artifacts
- **IMPLEMENT**: execute static, test, build, benchmark lanes and summarize outputs (including Issue #8 size metrics)
- **MIRROR**: current `validate-all` + artifact upload pattern
- **GOTCHA**: if isolated coverage runs fail global thresholds, use scoped `--coverage.include` fallback
- **CURRENT**: keep thresholds >=40 global unless phase explicitly raises gate
- **VALIDATE**: `make validate-all && make benchmark`
- **TEST_PYRAMID**: Confirm 70/20/10 intent by categorizing added tests in PR notes

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
| --- | --- | --- |
| `packages/cli/tests/benchmarks/cli-startup.test.ts` | startup budget, output schema, regression threshold checks | benchmark correctness and budget enforcement |
| `packages/cli/tests/integration/enterprise-network.test.ts` | proxy env set/unset, invalid CA bundle path, graceful failure messages | enterprise networking behavior |
| `packages/cli/tests/benchmarks/collect-metrics.test.ts` | parse success, malformed input, missing fields | benchmark parser resilience |

### Edge Cases Checklist

- [ ] Benchmark command missing binary path
- [ ] Benchmark tooling unavailable (`hyperfine` absent) and fallback path behavior
- [ ] Extremely noisy CI runner causing high variance
- [ ] Invalid/missing benchmark artifact files
- [ ] Binary size metric missing or unparsable in benchmark output
- [ ] Proxy variables set with malformed URLs
- [ ] Custom CA path points to unreadable file

### Binary Size Guardrails (Issue #8)

- [ ] Record `dist/cia` size in bytes and MB on every benchmark run
- [ ] Fail benchmark lane when size crosses configured threshold (initially warning threshold + fail threshold)
- [ ] Track startup-vs-size together to detect tradeoff regressions
- [ ] Publish size trend in benchmark artifact JSON/markdown

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
```

**EXPECT**: Exit 0, no lint/type-check errors.

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make build && ./dist/cia --version
```

**EXPECT**: Binary builds and returns version.

### Level 3: UNIT_TESTS

```bash
npx vitest --run --coverage
```

**EXPECT**: tests pass; global thresholds met (currently 40% configured baseline).

### Level 4: FULL_SUITE

```bash
make validate-all
```

**EXPECT**: all existing validation levels pass.

### Level 5: BENCHMARK_VALIDATION

```bash
make benchmark
```

**EXPECT**: benchmark run succeeds; JSON/markdown artifacts generated; overhead budgets evaluated; binary size metric and threshold evaluation present.

### Level 6: CURRENT_STANDARDS_VALIDATION

```bash
bun audit && npm view vitest@1.6.0 version && npm view @vitest/coverage-v8@1.6.0 version
```

**EXPECT**: advisories reviewed and documented; required package versions resolvable.

### Level 7: MANUAL_VALIDATION

1. Run `make benchmark` twice on same machine.
2. Compare generated mean/p95 values; confirm drift is within documented tolerance.
3. Run `RUN_E2E_TESTS=1 npx vitest --run packages/cli/tests/e2e.test.ts` to confirm benchmark additions did not regress smoke path.

---

## Acceptance Criteria

- [ ] Phase 10 tests are implemented and pass under governed commands
- [ ] Dedicated benchmark lane exists and produces retained artifacts
- [ ] Performance budgets are codified and fail on regressions
- [ ] Issue #8 guardrails exist: binary size regression checks are automated
- [ ] Enterprise network testing is covered via env-gated integration tests
- [ ] Existing CI (`make ci`) remains stable and non-flaky
- [ ] No regressions in exit code semantics or command behavior
- [ ] Security advisory review and mitigation notes are included in outputs
- [ ] No deprecated patterns introduced (e.g., unconditional heavy jobs on all PRs)

---

## Completion Checklist

- [ ] All tasks completed in order
- [ ] Each task validated immediately
- [ ] Level 1-5 validation commands executed successfully
- [ ] Current standards check completed and recorded
- [ ] Benchmark artifacts uploaded or available locally
- [ ] Documentation updated and runnable from clean checkout

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 6 (3 library resolution + 3 documentation queries)
**Web Intelligence Sources**: 8 (Vitest docs/blog, Bun docs, GitHub Actions docs, Hyperfine repo, GH advisories)
**Last Verification**: 2026-02-21T01:19:00Z
**Security Advisories Checked**: 4 (minimatch, ajv, esbuild, hono via `bun audit`/GHSA)
**Deprecated Patterns Avoided**:

- Running expensive benchmarks unconditionally on every CI run
- Asserting strict single-sample timing numbers on shared runners
- Introducing new benchmark dependencies when optional tooling suffices
- Solving binary size optimization without phase-owned packaging changes

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Benchmark flakiness on shared CI runners | MEDIUM | HIGH | use warmups, multiple runs, tolerant but meaningful thresholds |
| Security advisory churn in transitive deps | MEDIUM | MEDIUM | keep `bun audit` in validation flow and track patched versions |
| CI duration growth from added tests | MEDIUM | MEDIUM | env-gate heavy tests and isolate benchmark lane |
| Tooling mismatch (Vitest v1 project vs v4 docs) | MEDIUM | MEDIUM | avoid v4-only APIs unless upgrade is explicitly scoped |

---

## Notes

- Repository currently has no dedicated benchmark directory; phase implementation should introduce the smallest possible harness first.
- Version verification completed for key packages (`vitest@1.6.0`, `@vitest/coverage-v8@1.6.0`, `@openai/codex-sdk@0.87.0`, `typescript@5.9.3`).
- `bun audit` reports vulnerabilities primarily in transitive tooling; implementation should document triage and only escalate direct-action items needed for phase acceptance.

### Current Intelligence Considerations

- Vitest ecosystem is currently on v4.x docs/release line; project remains on v1.6.x and should preserve compatibility-first implementation unless migration is separately approved.
- Bun docs explicitly recommend `hyperfine` for command benchmarking; adopt as optional dependency/tool with fallback to Bun-native timing.
- GitHub Actions supports clear job-level conditions and artifact retention settings, matching the repository's existing CI split strategy.
