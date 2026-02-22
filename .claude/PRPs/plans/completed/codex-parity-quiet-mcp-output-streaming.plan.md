# Feature: Codex Parity Quiet Mode, MCP Zero-Server Skip, Explicit Output File, Streaming Reliability

## Summary

Align `cia run` behavior with `codex exec` expectations by making non-essential status chatter opt-in (`--verbose`), fully skipping MCP bootstrap when server count is zero, removing implicit `result.json` writes, and preserving true streaming semantics when reliability wrapping is enabled. The implementation keeps existing architecture (parseArgs CLI, provider factory, run command orchestration, wrapper-based provider enhancements) and focuses on low-risk targeted edits with regression tests around logging, MCP initialization gates, and retry/stream behavior.

## User Story

As a CI/CD engineer using `cia run`
I want clean default terminal output and immediate streamed tokens without hidden side effects
So that behavior matches `codex exec` expectations and is predictable in automation pipelines

## Problem Statement

`cia run` currently emits `[Status]` and `[MCP Provider]` noise by default, initializes MCP even when zero servers are configured, writes `result.json` by default due to CLI defaults, and buffers full provider output inside reliability wrapping before yielding any chunks. This creates parity drift versus `codex exec`, introduces unwanted file writes, and harms UX/perf for long-running streamed responses.

## Solution Statement

Introduce an explicit verbosity control at CLI/config level, gate noisy logs and status emission behind it, detect MCP server count from structured config and hard-skip MCP initialization when count is zero, remove `output-file` default from `withDefaults`, and refactor reliability flow from "collect then emit" to "emit as chunks arrive" while still preserving retry behavior before first successful stream commit.

## Metadata

| Field | Value |
|------|-------|
| Type | ENHANCEMENT |
| Complexity | HIGH |
| Systems Affected | CLI argument parsing, config model, run command orchestration, MCP provider/factory, reliability wrapper, help docs, tests |
| Dependencies | `p-retry@7.1.1` (existing), `@modelcontextprotocol/sdk@1.26.0` (existing), `@openai/codex-sdk@0.104.0` (existing) |
| Estimated Tasks | 10 |
| **Research Timestamp** | **2026-02-22T12:21:18+01:00** |

---

## UX Design

### Before State

```text
┌───────────────────────────── CLI RUN (default) ─────────────────────────────┐
│ User: cia run "Test" --provider codex                                       │
│   │                                                                          │
│   ├─ emits [Status] ... lines (always)                                       │
│   ├─ emits [MCP Provider] ... lines (when MCP path touched)                  │
│   ├─ may initialize MCP with 0 servers                                        │
│   ├─ writes result.json implicitly (via default output-file)                  │
│   └─ reliability wrapper buffers full response before yielding chunks         │
│                                                                              │
│ USER_FLOW: run command -> noisy stdout + hidden file side effect             │
│ PAIN_POINT: parity mismatch with codex exec; delayed visible streaming       │
│ DATA_FLOW: provider chunks -> reliability array buffer -> delayed emit        │
└───────────────────────────────────────────────────────────────────────────────┘
```

### After State

```text
┌───────────────────────────── CLI RUN (default) ─────────────────────────────┐
│ User: cia run "Test" --provider codex                                       │
│   │                                                                          │
│   ├─ no [Status]/[MCP Provider] chatter unless --verbose                     │
│   ├─ MCP init skipped entirely when server count = 0                         │
│   ├─ no file output unless --output-file is explicitly passed                │
│   └─ streamed chunks forwarded immediately through reliability layer          │
│                                                                              │
│ USER_FLOW: run command -> clean stdout -> deterministic side effects         │
│ VALUE_ADD: codex-like default UX + lower noise + safer CI behavior           │
│ DATA_FLOW: provider chunks -> validation -> immediate yield (stream-first)   │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Interaction Changes

| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `cia run` default | Prints `[Status]` lines | Silent by default | Output matches non-interactive parity expectations |
| `cia run --verbose` | No dedicated verbose switch | Explicitly enables status/provider operational logs | Debug visibility remains available on demand |
| MCP with 0 servers | Initializes and logs anyway | Fully skipped | Faster startup, no irrelevant noise |
| Output file behavior | Implicit `result.json` | Writes only with `--output-file` | No accidental workspace artifacts |
| Reliability wrapper | Buffers full stream before emit | Emits chunks as they arrive | Better latency and real streaming UX |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/cli.ts` | 13-45, 47-71, 173-184 | CLI flag parse + default injection points |
| P0 | `packages/cli/src/commands/run.ts` | 52-59, 150-157, 543-615 | Status emission path + output-file write gate |
| P0 | `packages/cli/src/providers/reliability.ts` | 36-54, 58-84, 128-131 | Current buffering logic to replace with streaming-first |
| P1 | `packages/cli/src/providers/index.ts` | 21-37, 68-74 | MCP init gate + reliability wrapper creation gate |
| P1 | `packages/cli/src/providers/mcp.ts` | 27-35, 63-71, 90-97 | `[MCP Provider]` logging hotspots |
| P1 | `packages/cli/src/shared/config/loader.ts` | 6-31 | `CIAConfig` option surface to extend |
| P2 | `packages/cli/tests/commands/run.test.ts` | 142-174, 176-267 | Existing output/status assertions to update |
| P2 | `packages/cli/tests/providers.reliability.test.ts` | 90-125 | Reliability pass-through test style |
| P2 | `packages/cli/tests/providers/factory.test.ts` | 82-92, 161-170 | Provider factory wrapping expectations |

**Current External Documentation (Verified Live):**

| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [p-retry README](https://github.com/sindresorhus/p-retry#pretryinput-options) ✓ Current | Retry semantics and abort behavior | Preserve retry correctness while changing stream flow | 2026-02-22T12:21:18+01:00 |
| [p-retry AbortError](https://github.com/sindresorhus/p-retry#aborterrormessage) ✓ Current | Non-retryable short-circuiting | Keep non-retryable failure handling intact | 2026-02-22T12:21:18+01:00 |
| [MCP TS SDK client docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md#connecting-to-a-server) ✓ Current | Client connect lifecycle | Validate skip-init strategy for zero-server config | 2026-02-22T12:21:18+01:00 |
| [Codex non-interactive exec](https://context7.com/openai/codex/llms.txt#non-interactive-exec-mode-commands) ✓ Current | `codex exec` behavior baseline | Parity target for quieter defaults | 2026-02-22T12:21:18+01:00 |
| [Node `util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig) ✓ Current | CLI option parsing constraints | Ensure new `--verbose` addition follows supported parser behavior | 2026-02-22T12:21:18+01:00 |

---

## Patterns to Mirror

**CLI_OPTION_AND_DEFAULT_PATTERN:**

```typescript
// SOURCE: packages/cli/src/cli.ts:13-44,173-184
function parseCliArgs(args: string[]) {
  return parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      'output-file': { type: 'string' },
      retries: { type: 'string' },
      'retry-backoff': { type: 'boolean' },
      timeout: { type: 'string' },
      'log-level': { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
}

function withDefaults(config: CIAConfig): CIAConfig {
  return {
    mode: config.mode ?? 'lazy',
    format: config.format ?? 'default',
    provider: config.provider ?? 'codex',
    'output-file': config['output-file'] ?? 'result.json',
    retries: config.retries ?? 1,
    ...config,
  };
}
```

**RUN_FIRE_AND_FORGET_STATUS_PATTERN:**

```typescript
// SOURCE: packages/cli/src/commands/run.ts:52-58
void emitStatusMessages(config).catch(error => {
  console.log(
    '[Status] Warning: Status emission failed:',
    error instanceof Error ? error.message : String(error)
  );
});
```

**PROVIDER_FACTORY_CONDITIONAL_WRAPPER_PATTERN:**

```typescript
// SOURCE: packages/cli/src/providers/index.ts:68-74
if (
  config &&
  (config.retries !== undefined || config['contract-validation'] || config['retry-timeout'])
) {
  assistantChat = new ReliableAssistantChat(assistantChat, config);
}
```

**STREAM_PASSTHROUGH_PATTERN_TO_COPY:**

```typescript
// SOURCE: packages/cli/src/providers/schema-validating-chat.ts:57-61
if (!this.config.schema) {
  for await (const chunk of this.provider.sendQuery(input, cwd, resumeSessionId)) {
    yield chunk;
  }
  return;
}
```

**TEST_STRUCTURE_PATTERN:**

```typescript
// SOURCE: packages/cli/tests/commands/run.test.ts:8-14,31-48
function makeGenerator(chunks: ChatChunk[]): AsyncGenerator<ChatChunk> {
  return (async function* generate() {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

it('returns success when assistant content is produced', async () => {
  const mockAssistantChat = {
    sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
  };
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  // assertions...
});
```

---

## Architecture Decisions

APPROACH_CHOSEN: Introduce a single explicit `verbose` boolean in CLI/config, make default behavior quiet, add a shared "MCP server count" gate before initialization in all call paths, and refactor reliability retries to be pre-first-yield retry-safe while preserving immediate chunk passthrough after stream begins.

RATIONALE: This minimizes moving parts, mirrors existing wrapper/factory patterns, and avoids overengineering. It keeps fail-loud semantics while removing unnecessary side effects and aligning user-visible behavior with non-interactive Codex expectations.

ALTERNATIVES_REJECTED:

- Add `--quiet` and `--verbose` both: rejected as unnecessary complexity for this scope; default-quiet + `--verbose` is enough.
- Keep current reliability buffering and only flush more often: rejected because it still violates streaming-first objective.
- Implement global logger framework now: rejected (YAGNI) since targeted gating is sufficient.

NOT_BUILDING (explicit scope limits):

- No redesign of MCP manager internals/protocol handling beyond init/log gating.
- No change to provider protocol contracts (`ChatChunk` schema remains as-is).
- No new output sink formats beyond existing `json|yaml|md|text`.

ARCHITECTURE INVARIANTS:

- CLI defaults remain deterministic and explicit in `withDefaults`; no implicit file writes.
- MCP initialization occurs only when `structuredConfig.mcp.servers.length > 0`.
- Reliability wrapper must not duplicate already-emitted chunks across retries.
- Non-retryable errors still fail early via `AbortError` path.

---

## Current Best Practices Validation

**Security (Context7 + Web Verified):**

- [x] No sensitive info added to default logs; verbose-only operational details.
- [x] Non-retryable auth/model errors still short-circuit retries via `AbortError` semantics.
- [x] Dependency advisory snapshot checked: `p-retry` repo shows no published advisories.
- [x] External parity reference (`openai/codex`) security advisory noted (sandbox bypass advisory exists); no direct dependency action required in this scope.

**Performance (Context7 + codebase validated):**

- [x] Stream-first chunk forwarding avoids O(n) response buffering in wrapper.
- [x] Zero-server MCP short-circuit removes avoidable startup work.
- [x] No additional retries introduced beyond current config.
- [x] Existing timeout guardrails in `run.ts` remain unchanged.

**Community/Standards Intelligence:**

- [x] `codex exec` non-interactive flow emphasizes direct stdout output; supports parity direction.
- [x] Node `parseArgs` supports adding boolean flags cleanly (`--verbose`).
- [x] MCP TS SDK connect model aligns with only connecting when transport targets exist.
- [x] No deprecated API usage proposed.

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `packages/cli/src/shared/config/loader.ts` | UPDATE | Add `verbose?: boolean` to typed config surface |
| `packages/cli/src/cli.ts` | UPDATE | Parse `--verbose`, plumb into config, remove default `'output-file'` |
| `packages/cli/src/commands/help.ts` | UPDATE | Document new verbosity behavior and explicit output-file semantics |
| `packages/cli/src/commands/run.ts` | UPDATE | Gate status emission/logs by verbosity and skip MCP status path when no servers |
| `packages/cli/src/providers/index.ts` | UPDATE | Skip MCP init when server count is zero; gate provider-factory logs by verbosity |
| `packages/cli/src/providers/mcp.ts` | UPDATE | Gate `[MCP Provider]` logs by verbosity and avoid noisy no-op logging |
| `packages/cli/src/providers/reliability.ts` | UPDATE | Replace full buffering with streaming-first retry-safe flow |
| `packages/cli/tests/commands/run.test.ts` | UPDATE | Assert quiet default and verbose opt-in status output |
| `packages/cli/tests/commands/help.test.ts` | UPDATE | Assert updated help text for output-file and verbose |
| `packages/cli/tests/providers/factory.test.ts` | UPDATE | Assert MCP init gate with zero servers + log behavior |
| `packages/cli/tests/providers.reliability.test.ts` | UPDATE | Assert first chunk is streamed without waiting for completion |
| `packages/cli/tests/e2e-mcp-skills.test.ts` | UPDATE | Adjust status assertions to pass `verbose: true` when expecting `[Status]` lines |

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: run fast targeted tests first, then governed checks.

**Coverage Target**: 75% for touched modules (`run`, `providers`, `cli`).

### Task 1: UPDATE `packages/cli/src/shared/config/loader.ts`

- ACTION: Add `verbose?: boolean` to `CIAConfig`.
- IMPLEMENT: Keep kebab-case keys as-is; `verbose` is a plain boolean like other top-level behavior flags.
- MIRROR: `packages/cli/src/shared/config/loader.ts:6-31`.
- GOTCHA: Ensure merge behavior keeps `false` values (current merge discards only `undefined|null|''`; boolean `false` must pass through).
- VALIDATE: `bun run type-check`.
- TEST_PYRAMID: No new file; covered by existing CLI/config tests.

### Task 2: UPDATE `packages/cli/src/cli.ts`

- ACTION: Add `--verbose` parse support and map into config.
- IMPLEMENT: Extend `parseCliArgs` options and `toCliConfig`; remove implicit `'output-file': 'result.json'` default from `withDefaults`.
- MIRROR: `packages/cli/src/cli.ts:13-45`, `packages/cli/src/cli.ts:47-71`, `packages/cli/src/cli.ts:173-184`.
- GOTCHA: Keep `retries` default behavior untouched unless explicitly changed by this feature (streaming-first still uses reliability default path).
- VALIDATE: `bun run type-check && bun run lint`.
- FUNCTIONAL: `bun packages/cli/src/cli.ts run "Test" --provider codex` should not create `result.json` unless `--output-file` is passed.

### Task 3: UPDATE `packages/cli/src/commands/help.ts`

- ACTION: Update help text for explicit output file behavior and verbose mode.
- IMPLEMENT: Change output-file line to remove default claim; add `--verbose` entry under debugging/status.
- MIRROR: existing `console.log` help style in `packages/cli/src/commands/help.ts:25-67`.
- GOTCHA: keep provider list dynamic (`getSupportedProviders`) unchanged.
- VALIDATE: `bun run type-check && npx vitest --run packages/cli/tests/commands/help.test.ts`.

### Task 4: UPDATE `packages/cli/src/providers/index.ts`

- ACTION: MCP init should execute only when actual server count > 0.
- IMPLEMENT: derive server count from `loadStructuredConfig(config)?.mcp?.servers?.length ?? 0`; skip init/logging when 0.
- MIRROR: conditional wrapper pattern in `packages/cli/src/providers/index.ts:68-74`.
- GOTCHA: support both MCP config shapes is already normalized by loader; do not duplicate conversion logic.
- VALIDATE: `bun run type-check && npx vitest --run packages/cli/tests/providers/factory.test.ts`.

### Task 5: UPDATE `packages/cli/src/providers/mcp.ts`

- ACTION: suppress `[MCP Provider]` noise unless verbose requested.
- IMPLEMENT: add internal log helper that checks `config?.verbose`; keep errors fail-loud via `console.error` where meaningful.
- MIRROR: existing initialization guard in `packages/cli/src/providers/mcp.ts:27-31`.
- GOTCHA: avoid changing behavior of `executeTool` failure pathways; only verbosity/log emission.
- VALIDATE: `bun run type-check && npx vitest --run packages/cli/tests/providers/mcp.test.ts`.

### Task 6: UPDATE `packages/cli/src/commands/run.ts`

- ACTION: make status emission opt-in and skip MCP status init on zero servers.
- IMPLEMENT: call `emitStatusMessages` only when `config.verbose === true`; inside status/capability helpers, guard MCP init by server count.
- MIRROR: fire-and-forget style `void emitStatusMessages(config).catch(...)` in `packages/cli/src/commands/run.ts:52-58`.
- GOTCHA: capability enhancement path currently initializes MCP in `enhanceCapabilityQuery`; zero-server guard is required there too.
- VALIDATE: `bun run type-check && npx vitest --run packages/cli/tests/commands/run.test.ts`.

### Task 7: UPDATE `packages/cli/src/providers/reliability.ts`

- ACTION: redesign sendQuery flow to stream first and avoid full buffering.
- IMPLEMENT:
  - Retry only until a stream starts producing committed output.
  - Once first non-error chunk is yielded, continue passthrough without array buffering.
  - Prevent retries after chunks already emitted to avoid duplicate output replay.
  - Preserve non-retryable checks and final normalized error chunk behavior.
- MIRROR: passthrough generator style from `packages/cli/src/providers/schema-validating-chat.ts:57-61`.
- GOTCHA: if provider throws after partial stream, fail current run loudly (no replay retry).
- VALIDATE: `bun run type-check && npx vitest --run packages/cli/tests/providers.reliability.test.ts`.
- TEST_PYRAMID: Add/adjust targeted unit tests for "first chunk emitted before completion" and "no retry after emit".

### Task 8: UPDATE tests for quiet/verbose + output-file behavior

- ACTION: adjust `run.test.ts`, `help.test.ts`, `e2e-mcp-skills.test.ts`.
- IMPLEMENT:
  - default run should not require/assert `[Status]` logs.
  - verbose-configured runs should assert status lines.
  - keep explicit output-file write test; add non-write default regression test through `main()` if needed.
- MIRROR: `vi.spyOn(console, 'log').mockImplementation(() => {})` pattern.
- VALIDATE: `npx vitest --run packages/cli/tests/commands/run.test.ts packages/cli/tests/commands/help.test.ts packages/cli/tests/e2e-mcp-skills.test.ts`.

### Task 9: UPDATE factory tests for MCP zero-server skip behavior

- ACTION: add assertions around MCP init call conditions.
- IMPLEMENT: spy on `mcpProvider.initialize` and assert not called when `servers.length === 0`; called when >0 and verbose optionally set.
- MIRROR: provider creation tests in `packages/cli/tests/providers/factory.test.ts:82-92`.
- VALIDATE: `npx vitest --run packages/cli/tests/providers/factory.test.ts`.

### Task 10: Full governed validation

- ACTION: run project-level validation pipeline after targeted tests pass.
- VALIDATE:
  - `make validate-l1`
  - `make validate-l2`
  - `make validate-l3`
  - `make validate-l4`
- FUNCTIONAL:
  - `bun packages/cli/src/cli.ts run "Test" --provider codex`
  - `bun packages/cli/src/cli.ts run "Test" --provider codex --verbose`
  - `bun packages/cli/src/cli.ts run "Test" --provider codex --output-file /tmp/cia-result.json`

---

## Testing Strategy

### Unit/Integration Tests to Update

| Test File | Test Cases | Validates |
|-----------|------------|-----------|
| `packages/cli/tests/commands/run.test.ts` | quiet default, verbose status enabled, explicit output-file only | run command parity behavior |
| `packages/cli/tests/providers/factory.test.ts` | MCP init not called with zero servers | provider factory integration gate |
| `packages/cli/tests/providers.reliability.test.ts` | emits first assistant chunk immediately; no post-yield retry | streaming-first reliability behavior |
| `packages/cli/tests/commands/help.test.ts` | help text reflects `--verbose` and output-file no default | docs/runtime consistency |
| `packages/cli/tests/e2e-mcp-skills.test.ts` | status assertions tied to verbose input | integration compatibility |

### Edge Cases Checklist

- [ ] `config.mcp` absent entirely.
- [ ] `config.mcp` present with empty `servers` array.
- [ ] OpenCode-style MCP object transformed to empty `servers` by loader.
- [ ] `verbose: false` explicitly set should stay quiet.
- [ ] `verbose: true` shows status/provider logs.
- [ ] reliability provider emits partial chunks then throws.
- [ ] `--output-file` omitted: no filesystem write.
- [ ] `--output-file` provided with inferred extension format still works.

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
```

EXPECT: lint and type-check pass.

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make validate-l4
```

EXPECT: binary builds and `--help`/`--version` succeed.

### Level 3: UNIT_TESTS

```bash
npx vitest --run packages/cli/tests/commands/run.test.ts packages/cli/tests/providers/factory.test.ts packages/cli/tests/providers.reliability.test.ts packages/cli/tests/commands/help.test.ts
```

EXPECT: changed areas pass without regressions.

### Level 4: FULL_SUITE

```bash
make validate-l3
```

EXPECT: full tests + build pass.

### Level 5: BROWSER_VALIDATION (not applicable)

- [x] N/A (no UI changes)

### Level 6: CURRENT_STANDARDS_VALIDATION

- [x] Re-check Context7 docs for `p-retry` and MCP SDK before coding.
- [x] Confirm no newly published advisories impacting touched dependencies.

### Level 7: MANUAL_VALIDATION

1. Run `cia run "Test" --provider codex` and verify no `[Status]`/`[MCP Provider]` lines by default.
2. Run same command with `--verbose` and verify status/provider operational lines appear.
3. Verify no `result.json` appears unless `--output-file` is provided.
4. Simulate slow streamed provider and verify first chunk appears before full completion.

---

## Acceptance Criteria

- [ ] Default run output excludes `[Status]` and `[MCP Provider]` lines.
- [ ] `--verbose` enables those lines for diagnostics.
- [ ] MCP initialization/logging is skipped when server count is zero.
- [ ] No implicit `result.json` creation from defaults.
- [ ] Reliability wrapper no longer buffers full response before emitting chunks.
- [ ] Existing retry semantics for pre-stream failures remain correct.
- [ ] Targeted and full validation commands pass.
- [ ] No deprecated or insecure patterns introduced.

---

## Completion Checklist

- [ ] Tasks executed in dependency order.
- [ ] Each task validated immediately.
- [ ] `make validate-l1` passed.
- [ ] targeted Vitest suites passed.
- [ ] `make validate-l3` passed.
- [ ] manual parity checks passed.
- [ ] external docs re-verified right before merge.

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 3
**Web Intelligence Sources**: 5
**Last Verification**: 2026-02-22T12:21:18+01:00
**Security Advisories Checked**: 2 (p-retry, openai/codex security pages)
**Deprecated Patterns Avoided**: default noisy logging in non-interactive mode, response buffering before stream emission, implicit output artifact creation

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Streaming retry refactor can change failure semantics | MEDIUM | HIGH | Add explicit tests for pre-yield retry and post-yield no-retry behavior |
| Quiet-default may break tests expecting `[Status]` lines | HIGH | MEDIUM | Update tests to set `verbose: true` when status assertions are intended |
| MCP server-count detection mismatch across config shapes | MEDIUM | MEDIUM | Use only `loadStructuredConfig(...).mcp.servers.length` as source of truth |
| Hidden reliance on implicit `result.json` in workflows | MEDIUM | MEDIUM | Document behavior change in help/changelog and add explicit `--output-file` guidance |

---

## Notes

### Current Intelligence Considerations

- `p-retry@7.1.1` is current and already in use; no dependency upgrade needed.
- `@modelcontextprotocol/sdk@1.26.0` and `@openai/codex-sdk@0.104.0` are current per npm at planning time.
- `codex exec` documentation emphasizes direct stdout for non-interactive mode, reinforcing quiet-default parity direction.

### Minimal File-Touch Strategy

Favor small, surgical edits over framework rewrites. Keep architecture stable: `cli.ts` for flags/defaults, `run.ts` for user-visible orchestration, `providers/index.ts` + `mcp.ts` for MCP init/log gating, and `reliability.ts` for stream/retry semantics.
