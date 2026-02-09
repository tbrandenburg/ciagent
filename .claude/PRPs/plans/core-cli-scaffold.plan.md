# Feature: Core CLI Scaffold

## Summary

Build the first production scaffold for `cia`: a Bun + TypeScript CLI with `run` and `models` commands, deterministic argument validation, environment/config loading, and fail-loud behavior that currently returns a clear "No provider configured" result for `cia run`. The implementation mirrors the existing async-stream client patterns from the PoC while aligning with current Bun/Commander/Vitest practices and security guidance.

## User Story

As a DevOps engineer using CI/CD automation
I want a working `cia` command with help/version and safe config parsing
So that I can verify installation and wire workflows before provider integrations land

## Problem Statement

The repository has a validated provider PoC in `dev/poc-codex-extraction/` but no installable CLI artifact implementing the PRD v1 command surface (`cia run`, `cia models`, mode/format flags, and fail-loud errors). This blocks phase progression and prevents end-to-end CLI validation in CI pipelines.

## Solution Statement

Create a minimal, strict CLI scaffold at repository root using Bun runtime and Commander.js subcommands, backed by strongly typed option parsing and explicit exit-code mapping. Reuse PoC type contracts and streaming assumptions without implementing provider execution in this phase; return explicit scaffolding errors for unimplemented provider execution paths.

## Metadata

| Field | Value |
| --- | --- |
| Type | NEW_CAPABILITY |
| Complexity | MEDIUM |
| Systems Affected | CLI entrypoint, argument parsing, config loading, validation, test harness, build/packaging |
| Dependencies | bun@1.3.6 (local runtime), commander@14.0.1 (latest), vitest@4.0.7 (latest), typescript (latest stable), @types/bun@1.3.8, @types/node@25.2.2 |
| Estimated Tasks | 13 |
| **Research Timestamp** | **2026-02-09T21:17:29Z** |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              BEFORE STATE                                    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │ DevOps User │ ──────► │ Wants `cia` │ ──────► │ Command not │            ║
║   │ in CI job   │         │ bootstrap    │         │ available   │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                                                               ║
║   USER_FLOW: install intent -> search commands -> no production CLI          ║
║   PAIN_POINT: PoC exists but no standardized entrypoint for CI pipelines      ║
║   DATA_FLOW: ad-hoc script experimentation only, no shared command contract   ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### After State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                               AFTER STATE                                    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌──────────────────────┐   ║
║   │ DevOps User │ ──────► │ `cia --help`│ ──────► │ Clear command surface │   ║
║   │ in CI job   │         │ `cia run`   │         │ + explicit failures    │   ║
║   └─────────────┘         └─────────────┘         └──────────────────────┘   ║
║                                   │                                           ║
║                                   ▼                                           ║
║                          ┌─────────────────┐                                  ║
║                          │ Scaffolded CLI  │ ◄── run/models wired,            ║
║                          │ (phase-ready)   │     providers deferred            ║
║                          └─────────────────┘                                  ║
║                                                                               ║
║   USER_FLOW: install -> help/version -> run/models -> deterministic output    ║
║   VALUE_ADD: stable contract for CI scripting + phase-2 provider onboarding   ║
║   DATA_FLOW: argv/stdin -> validated options -> command handler -> stdout/rc  ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes
| Location | Before | After | User Impact |
| --- | --- | --- | --- |
| Terminal (`cia --help`) | No command | Usage + flags printed | Fast onboarding in CI scripts |
| Terminal (`cia --version`) | No command | Version output | Verifiable install artifact |
| Terminal (`cia run "test"`) | Impossible | Deterministic fail-loud message (`No provider configured`) | Safe baseline before provider implementation |
| Terminal (`cia models`) | Impossible | Deterministic placeholder output and exit code contract | Enables workflow wiring now |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
| --- | --- | --- | --- |
| P0 | `dev/poc-codex-extraction/types.ts` | 8-37 | Canonical `MessageChunk` + `IAssistantClient` signatures to preserve |
| P0 | `dev/poc-codex-extraction/main.ts` | 68-106 | Existing CLI control flow and exit handling style |
| P1 | `dev/poc-codex-extraction/codex.ts` | 34-38, 80-137 | AsyncGenerator contract and fail-loud error wrapping |
| P1 | `dev/poc-codex-extraction/claude.ts` | 64-90, 99-127 | Streaming iteration and error stderr filtering patterns |
| P2 | `docs/cia-cli-spec.md` | 10-33, 47-76, 227-234 | Command surface, mode/format rules, required exit codes |
| P2 | `.claude/PRPs/prds/ciagent-cli-tool.prd.md` | 231-241 | Phase-1 scope and success signal |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
| --- | --- | --- | --- |
| [Bun Executables](https://bun.sh/docs/bundler/executables) ✓ Current | `bun build --compile` | Binary packaging path for phase 10 compatibility | 2026-02-09T21:17:29Z |
| [Bun Shebang](https://bun.sh/docs/runtime/shebang) ✓ Current | Shebang execution | Correct CLI entrypoint for Bun runtime | 2026-02-09T21:17:29Z |
| [Commander README](https://github.com/tj/commander.js#asynchronous-action-handlers) ✓ Current | `parseAsync` | Async command actions for future provider calls | 2026-02-09T21:17:29Z |
| [Commander README](https://github.com/tj/commander.js#required-option) ✓ Current | Required option behavior | Fail-early argument constraints | 2026-02-09T21:17:29Z |
| [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html) ✓ Current | Coverage execution | Coverage gate wiring (`vitest run --coverage`) | 2026-02-09T21:17:29Z |
| [Vitest Config (v4.0.7)](https://github.com/vitest-dev/vitest/blob/v4.0.7/docs/config/index.md#coveragethresholds) ✓ Current | `coverage.thresholds` | Enforce PRD phase coverage floor | 2026-02-09T21:17:29Z |
| [GitHub Advisory Query: commander](https://github.com/advisories?query=ecosystem%3Anpm+commander) ✓ Current | Advisory status | Dependency security check | 2026-02-09T21:17:29Z |
| [GitHub Advisory Query: vitest](https://github.com/advisories?query=ecosystem%3Anpm+vitest) ✓ Current | Advisory status | Dependency security check | 2026-02-09T21:17:29Z |
| [GitHub Advisory Query: @openai/codex-sdk](https://github.com/advisories?query=ecosystem%3Anpm+%22%40openai%2Fcodex-sdk%22) ✓ Current | Advisory status | Current project dependency check | 2026-02-09T21:17:29Z |
| [GitHub Advisory Query: @anthropic-ai/claude-agent-sdk](https://github.com/advisories?query=ecosystem%3Anpm+%22%40anthropic-ai%2Fclaude-agent-sdk%22) ✓ Current | Advisory status | Current project dependency check | 2026-02-09T21:17:29Z |
| [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) ✓ Current | Validation strategy | Argument/context input hardening | 2026-02-09T21:17:29Z |
| [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) ✓ Current | Secret handling | Avoid key leakage in logs/errors | 2026-02-09T21:17:29Z |

---

## Patterns to Mirror

**NAMING_CONVENTION:**
```typescript
// SOURCE: dev/poc-codex-extraction/main.ts:15-16
function displayChunk(chunk: MessageChunk) {
  switch (chunk.type) {
```

```typescript
// SOURCE: dev/poc-codex-extraction/main.ts:42-43
async function testClient(client: IAssistantClient, name: string) {
  console.log(`\n${'='.repeat(60)}`);
```

**ERROR_HANDLING:**
```typescript
// SOURCE: dev/poc-codex-extraction/main.ts:54-62
try {
  for await (const chunk of client.sendQuery(prompt, cwd)) {
    displayChunk(chunk);
  }
} catch (error) {
  console.error(`✗ ${name} test failed:`, error);
  throw error;
}
```

```typescript
// SOURCE: dev/poc-codex-extraction/codex.ts:133-136
} catch (error) {
  console.error('[Codex] Query error:', error);
  throw new Error(`Codex query failed: ${(error as Error).message}`);
}
```

**LOGGING_PATTERN:**
```typescript
// SOURCE: dev/poc-codex-extraction/codex.ts:21-31
console.log(`[Codex] Loading auth from: ${authPath}`);
console.log('[Codex] Creating SDK instance...');
this.codex = new Codex();
console.log('[Codex] ✓ SDK instance created');
```

```typescript
// SOURCE: dev/poc-codex-extraction/claude.ts:86-88
if (isError) {
  console.error(`[Claude stderr] ${output}`);
}
```

**TYPE_DEFINITION_PATTERN:**
```typescript
// SOURCE: dev/poc-codex-extraction/types.ts:8-14
export interface MessageChunk {
  type: 'assistant' | 'result' | 'system' | 'tool' | 'thinking';
  content?: string;
  sessionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}
```

```typescript
// SOURCE: dev/poc-codex-extraction/types.ts:27-31
sendQuery(
  prompt: string,
  cwd: string,
  resumeSessionId?: string
): AsyncGenerator<MessageChunk>;
```

**SERVICE_PATTERN (STREAMING CONTRACT):**
```typescript
// SOURCE: dev/poc-codex-extraction/claude.ts:99-101
try {
  for await (const msg of query({ prompt, options })) {
```

```typescript
// SOURCE: dev/poc-codex-extraction/codex.ts:85-86
for await (const event of result.events) {
  if (event.type === 'error') {
```

**TEST_STRUCTURE (CURRENT GAP TO ADDRESS):**
```typescript
// SOURCE: docs/cia-cli-spec.md:8-9
// v1 returns a single response (non-streaming); streaming is deferred to v2+.
```

The codebase currently has no automated test files outside planning artifacts. Phase 1 must establish the first repeatable Vitest pattern.

---

## Codebase Intelligence Discoveries

| Category | File:Lines | Pattern Description | Code Snippet |
| --- | --- | --- | --- |
| ENTRYPOINT | `dev/poc-codex-extraction/main.ts:1` | Bun shebang entry style | `#!/usr/bin/env bun` |
| CLI FLOW | `dev/poc-codex-extraction/main.ts:68-103` | Parse args, branch by command, explicit `process.exit(1)` on errors | `const clientType = args[0]?.toLowerCase();` |
| INTERFACE | `dev/poc-codex-extraction/types.ts:20-37` | Provider-neutral contract with async generator | `sendQuery(...): AsyncGenerator<MessageChunk>;` |
| STREAMING LOOP | `dev/poc-codex-extraction/codex.ts:85-132` | Event-driven chunk translation into internal types | `for await (const event of result.events) { ... }` |
| LOGGING PREFIX | `dev/poc-codex-extraction/codex.ts:21-31` | Domain-prefixed logs | ``console.log(`[Codex] ...`)`` |
| STDERR FILTER | `dev/poc-codex-extraction/claude.ts:76-89` | Log only meaningful errors from subprocess stderr | `output.toLowerCase().includes('error')` |
| MODE RULES | `docs/cia-cli-spec.md:29-33` | strict mode requires schema; lazy mode never enforces | `--mode=strict requires a schema` |
| EXIT CODES | `docs/cia-cli-spec.md:227-234` | Enumerated non-zero exit codes for failure classes | `3 Authentication/config error` |
| DEPENDENCIES | `dev/poc-codex-extraction/package.json:6-13` | Existing provider SDK baselines | `@openai/codex-sdk`, `@anthropic-ai/claude-agent-sdk` |
| RESOLVED DEPS | `dev/poc-codex-extraction (bun pm ls)` | Current installed versions differ from range floor | `@anthropic-ai/claude-agent-sdk@0.2.37` |

---

## Architecture Strategy

APPROACH_CHOSEN: Root-level single-package scaffold (`src/cli.ts` + `src/commands/*` + `src/core/*`) using Commander.js for subcommands and Bun as runtime/build tool.

RATIONALE: This is the smallest path that satisfies Phase 1 scope (`run`, `models`, mode/format parsing, graceful failure) while preserving PoC interface contracts for later phases. Commander provides native subcommand ergonomics needed by the spec, and Bun keeps startup/build expectations aligned with PRD targets.

ALTERNATIVES_REJECTED:

- Node `util.parseArgs` only: rejected because multi-command wiring (`run`, `models`) and required-option UX are cleaner and less error-prone with Commander, matching the PRD CLI-framework decision.
- Monorepo package split in Phase 1 (`packages/cli`, `packages/core`): rejected as over-scoped for current repository maturity; adds friction before validating baseline UX.
- Implementing provider execution now: rejected because Phase 1 explicitly targets scaffold behavior and graceful unconfigured-provider failure.

NOT_BUILDING (explicit scope limits):

- Real provider API calls (Codex/Claude/Azure/OpenAI) in this phase.
- Streaming stdout behavior (explicitly phase 7/v2+ in PRD).
- MCP/Skills/Tools integration (phase 8).
- URL context fetching and GitHub API integration (phase 5).

---

## Current Best Practices Validation

**Security (Context7 + Web Verified):**
- [x] Input validation strategy aligned with OWASP guidance before file/URL usage.
- [x] Secrets are read from env/config and must not be echoed in logs/errors.
- [x] Dependency advisory checks run via GitHub Advisory Database queries for `commander`, `vitest`, `@openai/codex-sdk`, `@anthropic-ai/claude-agent-sdk`.
- [x] Fail-loud and explicit exit code mapping prevents silent fallback behavior.

**Performance (Current Guidance Verified):**
- [x] Bun executable compilation path (`bun build --compile`) confirmed current.
- [x] Async command parsing via Commander `parseAsync` avoids blocking future provider calls.
- [x] Scope kept minimal in phase 1 to preserve startup overhead budget (<100ms overall target measured later in phase 9).

**Community Intelligence:**
- [x] Commander maintainers recommend `parseAsync` when actions are async.
- [x] Commander 14.0.1 latest patch observed in release feed; pinning to latest patch avoids known regression churn.
- [x] Vitest v4 docs confirm built-in threshold controls and `vitest run --coverage` command path.
- [x] No conflicting community evidence found that contradicts chosen scaffold approach.

---

## Files to Change

| File | Action | Justification |
| --- | --- | --- |
| `package.json` | CREATE | Root CLI package manifest, scripts, bin mapping |
| `tsconfig.json` | CREATE | Strict TypeScript baseline for CLI code |
| `Makefile` | CREATE | Standardized quality gates (`lint`, `type-check`, `test`, `build`, `ci`) |
| `.githooks/pre-push` | CREATE | Mandatory guard to run `make ci` before push |
| `vitest.config.ts` | CREATE | Coverage gate and test defaults |
| `src/cli.ts` | CREATE | Bun shebang + root Commander program bootstrap |
| `src/commands/run.ts` | CREATE | `cia run` command, mode/format/schema validation |
| `src/commands/models.ts` | CREATE | `cia models` command scaffold |
| `src/core/config.ts` | CREATE | Env/config loading and precedence rules |
| `src/core/errors.ts` | CREATE | Typed error classes and exit-code mapping |
| `src/core/exit-codes.ts` | CREATE | Canonical numeric exit codes from CLI spec |
| `src/core/types.ts` | CREATE | Shared CLI option/result types |
| `tests/cli.test.ts` | CREATE | End-to-end command routing tests (spawn-like) |
| `tests/run-command.test.ts` | CREATE | Mode/format validation unit tests |
| `README.md` | UPDATE | Replace stub with phase-1 quickstart and examples |
| `.claude/PRPs/prds/ciagent-cli-tool.prd.md` | UPDATE | Mark phase 1 in-progress and link plan |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- No provider factory or concrete provider clients in this phase.
- No context ingestion implementation (`--context` accepted/validated only if needed for parser completeness, not executed).
- No schema retry loop against LLM providers (strict-mode checks are local argument validation only).

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

### Task 1: CREATE `package.json`

- **ACTION**: Define CLI package, `bin` mapping, scripts
- **IMPLEMENT**: `name`, `version`, `type`, `bin.cia`, scripts: `lint`, `type-check`, `test`, `build`, `ci`
- **MIRROR**: `dev/poc-codex-extraction/package.json:1-14` for minimal manifest style
- **IMPORTS/DEPS**: `commander`, `vitest`, `typescript`, `@types/bun`, `@types/node`
- **GOTCHA**: Keep scripts deterministic; no hidden fallback commands
- **CURRENT**: Commander latest from npm registry dist-tag (`14.0.1`), Vitest v4 docs
- **VALIDATE**: `bun run --bun --help >/dev/null`

### Task 2: CREATE `tsconfig.json`

- **ACTION**: Add strict compiler config for Bun + Node types
- **IMPLEMENT**: ES2022 target/module, strict mode, no unused locals/params, moduleResolution `bundler`
- **MIRROR**: `dev/poc-codex-extraction/types.ts:8-37` (strict typing expectations)
- **GOTCHA**: Include both `bun-types` and `node` where needed; avoid implicit `any`
- **CURRENT**: Bun docs recommend TypeScript first-class support
- **VALIDATE**: `bunx tsc --noEmit`

### Task 3: CREATE `Makefile`

- **ACTION**: Add mandatory build/test automation entrypoints
- **IMPLEMENT**: `lint`, `type-check`, `test`, `build`, `ci` targets where `ci` composes all quality gates
- **MIRROR**: AGENTS mandatory rules (`Never skip tests`, `Linting and testing have to pass`)
- **GOTCHA**: Fail fast on first failing step; no silent fallbacks
- **CURRENT**: Keep recipes portable for Bun-based projects
- **VALIDATE**: `make ci`

### Task 4: CREATE `.githooks/pre-push`

- **ACTION**: Add mandatory pre-push hook that runs `make ci`
- **IMPLEMENT**: executable shell hook with `set -eu` and `make ci`
- **MIRROR**: Fail-loud style from existing PoC error handling
- **GOTCHA**: Also document/execute `git config core.hooksPath .githooks` in setup so hook is active
- **CURRENT**: Keep hook simple and deterministic
- **VALIDATE**: `chmod +x .githooks/pre-push && git config core.hooksPath .githooks && .githooks/pre-push`

### Task 5: CREATE `src/core/exit-codes.ts` and `src/core/errors.ts`

- **ACTION**: Encode spec exit-code contract and typed errors
- **IMPLEMENT**: constants `SUCCESS`, `INPUT_ERROR`, `SCHEMA_ERROR`, `AUTH_ERROR`, `LLM_ERROR`, `TIMEOUT`; domain errors with `exitCode`
- **MIRROR**: `docs/cia-cli-spec.md:227-234` and PoC fail-loud catch blocks
- **GOTCHA**: Never collapse all failures to `1`; preserve semantic codes
- **CURRENT**: Security guidance favors explicit failure classes
- **VALIDATE**: `bunx tsc --noEmit`

### Task 6: CREATE `src/core/config.ts`

- **ACTION**: Implement config precedence and env parsing
- **IMPLEMENT**: CLI flags > `.cia/config.json` (repo/home) > env fallback, with clear missing-key errors
- **MIRROR**: `docs/cia-cli-spec.md:81-96`
- **GOTCHA**: Do not print raw tokens in logs; redact values
- **CURRENT**: OWASP secrets-management guidance
- **VALIDATE**: `bun test tests/config.test.ts` (created in same phase if needed)

### Task 7: CREATE `src/core/types.ts`

- **ACTION**: Define CLI command option types and run payload contracts
- **IMPLEMENT**: `RunMode`, `OutputFormat`, `ProviderName`, `RunCommandOptions`
- **MIRROR**: `dev/poc-codex-extraction/types.ts:8-37`
- **GOTCHA**: Keep union literals aligned to spec provider list
- **CURRENT**: Type unions reduce invalid runtime states
- **VALIDATE**: `bunx tsc --noEmit`

### Task 8: CREATE `src/commands/run.ts`

- **ACTION**: Implement `run` command parser and phase-1 placeholder execution
- **IMPLEMENT**: parse prompt/input, enforce mode/format matrix preconditions, return "No provider configured" path for execution
- **MIRROR**: `dev/poc-codex-extraction/main.ts:68-103` (control flow + exits)
- **GOTCHA**: enforce strict mode schema requirement from spec lines 31-33
- **CURRENT**: Commander required options and async action guidance
- **VALIDATE**: `bun test tests/run-command.test.ts`

### Task 9: CREATE `src/commands/models.ts`

- **ACTION**: Implement `models` command scaffold output
- **IMPLEMENT**: deterministic placeholder list or explicit not-configured message with non-zero exit when no provider context
- **MIRROR**: `dev/poc-codex-extraction/main.ts:77-93` (branching/usage response)
- **GOTCHA**: maintain scripting-friendly plain text + optional JSON output compatibility path
- **CURRENT**: CLI ergonomics from Commander docs
- **VALIDATE**: `bun test tests/cli.test.ts -t "models"`

### Task 10: CREATE `src/cli.ts`

- **ACTION**: Wire root command, subcommands, help/version, and centralized error handling
- **IMPLEMENT**: shebang, `.name('cia')`, `.version(...)`, attach `run` and `models`, `await program.parseAsync(process.argv)`
- **MIRROR**: `dev/poc-codex-extraction/main.ts:68-106` plus Commander parseAsync pattern
- **GOTCHA**: ensure unknown command exits with input-validation code
- **CURRENT**: Commander async action handler recommendation
- **VALIDATE**: `bun src/cli.ts --help && bun src/cli.ts --version`

### Task 11: CREATE `vitest.config.ts` and initial tests

- **ACTION**: Configure Vitest + coverage threshold and write baseline tests
- **IMPLEMENT**: coverage enabled, thresholds >=40% (phase minimum), tests for help/version/run strict mode guard
- **MIRROR**: PRD phase-1 testing requirement and spec mode rules
- **GOTCHA**: avoid flaky tests that call real provider networks
- **CURRENT**: Vitest v4 `coverage.thresholds`
- **VALIDATE**: `bunx vitest run --coverage`

### Task 12: UPDATE `README.md`

- **ACTION**: Document install/run basics and current phase limitations
- **IMPLEMENT**: quickstart commands, flags summary, explicit note that providers are scaffold-only in phase 1
- **MIRROR**: `dev/poc-codex-extraction/README.md:32-46` concise usage style
- **GOTCHA**: do not promise implemented provider features yet
- **VALIDATE**: `rg -n "cia run|cia models|phase" README.md`

### Task 13: Final integration validation

- **ACTION**: Run full static + test + build sequence
- **IMPLEMENT**: execute validation ladder and fix failures before completion
- **MIRROR**: fail-loud principle from repo instructions
- **GOTCHA**: no skipped tests, no `|| true`
- **CURRENT**: current docs + advisory status reconfirmed before finish
- **VALIDATE**: `bun run ci`

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
| --- | --- | --- |
| `tests/cli.test.ts` | help/version/unknown command | Root routing and exit behavior |
| `tests/run-command.test.ts` | lazy vs strict guards, schema requirement, format parsing | Spec-compliant argument validation |
| `tests/config.test.ts` | env fallback, config file precedence, secret redaction | Configuration safety and correctness |

### Edge Cases Checklist

- [ ] Empty prompt with no `--input-file`
- [ ] `--mode strict` without schema input
- [ ] Invalid `--format` value
- [ ] Unknown provider name
- [ ] Missing auth env for selected provider
- [ ] Invalid JSON in `.cia/config.json`
- [ ] Home config exists but unreadable

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
bun run lint && bun run type-check
```

**EXPECT**: Exit 0, no lint/type errors

### Level 2: UNIT_TESTS

```bash
bun run test
```

**EXPECT**: All unit tests pass

### Level 3: FULL_SUITE

```bash
bun run test && bun run build
```

**EXPECT**: Tests pass, build succeeds

### Level 4: DATABASE_VALIDATION (if schema changes)

Not applicable for Phase 1.

### Level 5: BROWSER_VALIDATION (if UI changes)

Not applicable for Phase 1.

### Level 6: CURRENT_STANDARDS_VALIDATION

```bash
bun run test && bunx vitest run --coverage
```

**EXPECT**: Coverage threshold met and no deprecated API usage

### Level 7: MANUAL_VALIDATION

1. Run `bun src/cli.ts --help` and confirm `run` + `models` commands appear.
2. Run `bun src/cli.ts --version` and confirm semantic version output.
3. Run `bun src/cli.ts run "test"` with no provider env and confirm explicit "No provider configured" error.
4. Run `bun src/cli.ts run --mode strict "test"` without schema and confirm strict validation error + proper exit code.

---

## Acceptance Criteria

- [ ] `cia --help` and `cia --version` work through Bun entrypoint
- [ ] `cia run "test"` fails gracefully with explicit unconfigured-provider message
- [ ] Mode/format parsing and strict-schema requirement follow `docs/cia-cli-spec.md`
- [ ] Level 1-3 validations pass with exit 0
- [ ] Coverage baseline meets or exceeds 40% (phase minimum)
- [ ] Naming, error, and streaming contracts mirror PoC patterns
- [ ] No deprecated patterns introduced in scaffold
- [ ] Security guidance (input validation + secrets handling) applied

---

## Completion Checklist

- [ ] Tasks executed in dependency order
- [ ] Validation run after each task block
- [ ] Lint + type-check pass
- [ ] Unit tests pass
- [ ] Build succeeds
- [ ] Current docs/advisories re-checked at completion
- [ ] PRD phase table updated with plan path

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 3 (`/oven-sh/bun`, `/tj/commander.js`, `/vitest-dev/vitest/v4.0.7`)
**Web Intelligence Sources Consulted**: 15 (official docs, npm registry metadata, GitHub advisories, community Q&A)
**Last Verification**: 2026-02-09T21:17:29Z
**Security Advisory Checks Performed**: 4 package-specific GitHub Advisory queries
**Deprecated Patterns Avoided**: silent fallback auth behavior, implicit mode coercion, non-semantic exit codes

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Scaffold command surface drifts from CLI spec | MEDIUM | HIGH | Lock to spec lines `10-76`, add parser tests for each rule |
| Commander major behavior changes in future | LOW | MEDIUM | Pin exact major/minor and keep parse behavior covered with tests |
| Secret leakage in error logs | MEDIUM | HIGH | Centralize error formatting with redaction in `config.ts`/`errors.ts` |
| Startup overhead grows unexpectedly | MEDIUM | MEDIUM | Keep phase 1 minimal, benchmark in phase 9, avoid eager provider imports |
| Dependency advisories appear during implementation | LOW | HIGH | Re-run advisory queries before merge and update versions if needed |

---

## Notes

- `CLAUDE.md` was not present at repo root during planning; AGENTS.md instructions were used as the governing local policy.
- Existing file `.claude/PRPs/plans/core-cli-scaffold.old` contains references to `dev/remote-coding-agent/...` paths that do not exist in this repository; this new plan removes those invalid dependencies.
- `dev/poc-codex-extraction/package.json` declares `@anthropic-ai/claude-agent-sdk` at `^0.2.7` but resolved installation is `0.2.37` (`bun pm ls`), so implementation should pin exact versions for reproducibility.

### Current Intelligence Considerations

- Commander latest dist-tag is `14.0.1`; use this patch level for stability.
- Vitest documentation currently includes v4.0.7 config semantics for coverage thresholds.
- Bun executable compilation and shebang docs are current and align with planned packaging path.
