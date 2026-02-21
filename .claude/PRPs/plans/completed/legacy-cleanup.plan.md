# Feature: Legacy Environment Variable Cleanup (Phase 12)

## Summary

Phase 12 removes deprecated implicit environment-variable configuration paths (`CIA_*`, `AZURE_OPENAI_*`, `OPENAI_*`, `ANTHROPIC_*`) so CLI behavior is explicit and deterministic via `.cia/config.json` plus CLI flags, while preserving enterprise infrastructure environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`). The implementation mirrors existing fail-loud validation and error patterns, keeps networking behavior intact, and adds migration-focused tests/docs so the breaking change is intentional and safe.

## User Story

As a DevOps engineer operating `cia` in CI/CD
I want configuration to come only from explicit config files and CLI flags
So that behavior is predictable, auditable, and not silently driven by hidden environment defaults.

## Problem Statement

The current code still reads legacy auth/default env vars in runtime config loading and help/validation messaging (`CIA_PROVIDER`, `CIA_MODEL`, provider auth envs), which contradicts the PRD Phase 12 requirement for explicit configuration-only behavior. This causes ambiguity in config precedence and makes migration riskier for enterprise users.

## Solution Statement

Refactor configuration loading to keep env ingestion only for infrastructure networking and `.env` expansion support; remove legacy env-driven defaults for provider/model/runtime options; update validation + help + docs to instruct explicit config; preserve provider runtime env passthrough only where required by SDK subprocess internals but stop using env vars as first-class config input. Add a dedicated migration guide and focused regression tests for both rejection/messaging and preserved enterprise networking.

## Metadata

| Field | Value |
| --- | --- |
| Type | REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | `packages/cli/src/shared/config`, `packages/cli/src/shared/validation`, `packages/cli/src/shared/errors`, `packages/cli/src/commands/help`, `packages/cli/src/providers`, `packages/cli/tests`, `docs/`, `README.md`, `CHANGELOG.md` |
| Dependencies | Existing only: `vitest@^1.6.0` (repo), `@anthropic-ai/claude-agent-sdk@^0.2.7`, `@anthropic-ai/sdk@^0.74.0`, `@modelcontextprotocol/sdk@^1.26.0`; no new packages |
| Estimated Tasks | 11 |
| **Research Timestamp** | **2026-02-21T11:52:36Z** |

---

## UX Design

### Before State

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                                BEFORE STATE                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  CI job sets CIA_PROVIDER/CIA_MODEL env vars ──► cia run                    ║
║         │                                                                    ║
║         ├── loader consumes legacy env fallbacks                             ║
║         ├── help text advertises legacy env precedence                       ║
║         └── behavior differs based on hidden shell state                     ║
║                                                                              ║
║  USER_FLOW: env vars + optional config/flags decide runtime                 ║
║  PAIN_POINT: implicit config path conflicts with explicit-config policy      ║
║  DATA_FLOW: process.env -> loadFromEnv() -> merged config -> command runtime ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### After State

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                                 AFTER STATE                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  CI job sets .cia/config.json + CLI flags ──► cia run                        ║
║                         │                                                    ║
║                         ├── loader ignores legacy CIA/provider env defaults  ║
║                         ├── network env vars still normalized into config    ║
║                         └── invalid legacy usage fails loudly w/ migration   ║
║                                                                              ║
║  USER_FLOW: explicit config + flags, deterministic precedence               ║
║  VALUE_ADD: predictable behavior + clean migration path                      ║
║  DATA_FLOW: config files/CLI -> validation -> runtime; infra env only path  ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes

| Location | Before | After | User Impact |
| --- | --- | --- | --- |
| `packages/cli/src/shared/config/loader.ts` | `CIA_*` + provider env vars become runtime defaults | only enterprise network env vars are ingested from env | explicit config policy enforced |
| `packages/cli/src/shared/validation/validation.ts` | missing model guidance suggests `CIA_MODEL` | guidance points to `--model` or `.cia/config.json` | no contradictory migration messaging |
| `packages/cli/src/commands/help.ts` | precedence lists env defaults first | precedence lists user/repo config then CLI only for feature config | docs match implementation |
| `docs/cia-cli-spec.md` | provider defaults documented as env fallback | env section limited to infra vars + explicit `{env:VAR}` substitution usage | better operator clarity |
| CLI runtime | silent legacy env fallback | fail-loud migration errors for legacy env keys | safer upgrades in CI |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
| --- | --- | --- | --- |
| P0 | `packages/cli/src/shared/config/loader.ts` | 64-170, 242-382 | current precedence merge and env ingestion logic to modify safely |
| P0 | `packages/cli/src/cli.ts` | 123-170 | defaulting and config entrypoint behavior |
| P0 | `packages/cli/src/shared/validation/validation.ts` | 227-249 | execution requirement messaging pattern |
| P1 | `packages/cli/src/shared/errors/error-handling.ts` | 61-83, 207-237 | common error factory/suggestion style |
| P1 | `packages/cli/src/commands/help.ts` | 59-113 | CLI user-facing config precedence and auth docs |
| P1 | `packages/cli/tests/config/loader.test.ts` | 97-176 | env-loading and precedence test pattern |
| P1 | `packages/cli/tests/integration/enterprise-network.test.ts` | 53-113 | preserved infra env behavior contract |
| P2 | `packages/cli/src/providers/claude.ts` | 25-77, 166-186 | env usage boundary for provider runtime behavior |
| P2 | `packages/cli/src/providers/mcp/manager.ts` | 65-99 | debug-level env usage to migrate off `CIA_LOG_LEVEL` |
| P2 | `docs/cia-cli-spec.md` | 82-246 | spec text that currently conflicts with Phase 12 objective |

**Current External Documentation (Verified Live):**

| Source | Section | Why Needed | Last Verified |
| --- | --- | --- | --- |
| [Node.js Environment Variables](https://nodejs.org/docs/latest-v22.x/api/environment_variables.html#processenv) | `process.env` and dotenv semantics | keep env parsing assumptions aligned with current Node behavior | 2026-02-21T11:52:36Z |
| [Vitest v1 Mocking](https://v1.vitest.dev/guide/mocking#mock-import-meta-env) | `vi.stubEnv` and env reset patterns | modernize env-var tests without leakage between cases | 2026-02-21T11:52:36Z |
| [Vitest Mocking (latest)](https://vitest.dev/guide/mocking#mock-import-meta-env) | current guidance parity | ensure tests remain forward-compatible beyond v1 | 2026-02-21T11:52:36Z |
| [OWASP Cheat Sheet Series](https://github.com/owasp/cheatsheetseries) | secure config/secrets guidance | enforce no hardcoded secrets and secure defaults in migration | 2026-02-21T11:52:36Z |
| [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) | minimatch ReDoS advisory | capture current dependency risk surfaced by `bun audit` | 2026-02-21T11:52:36Z |

---

## Patterns to Mirror

**NAMING_CONVENTION:**

```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:64-80
export function loadConfig(cliArgs: Partial<CIAConfig> = {}): CIAConfig {
  let config = loadFromEnv();

  const userConfig = loadUserConfig();
  if (userConfig) {
    config = mergeConfigs(config, userConfig);
  }
```

**ERROR_HANDLING:**

```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:61-67
missingProvider: (): CliError =>
  createError(
    ExitCode.AUTH_CONFIG,
    'Provider is required',
    'Only provider=codex is supported',
    'Set --provider=codex or CIA_PROVIDER=codex'
  ),
```

**LOGGING_PATTERN:**

```typescript
// SOURCE: packages/cli/src/providers/mcp/manager.ts:96-98
console.log(
  `[MCP] Network diagnostics for ${serverName}: proxy=${proxyValue}, no_proxy=${noProxy || 'none'}, ca_bundle=${caBundle || 'none'}, node_use_env_proxy=${useEnvProxy || 'unset'}`
);
```

**CONFIG_MERGE_PATTERN:**

```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:368-381
function mergeConfigs(base: Partial<CIAConfig>, override: Partial<CIAConfig>): CIAConfig {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'context' && Array.isArray(value)) {
        merged.context = [...(merged.context || []), ...value];
      } else {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
```

**SERVICE_PATTERN:**

```typescript
// SOURCE: packages/cli/src/cli.ts:123-133
const config = withDefaults(loadConfig(toCliConfig(values as Record<string, unknown>)));

const configValidation = validateConfig(config);
if (!configValidation.isValid) {
  const error = CommonErrors.invalidConfig(
    'configuration validation',
    configValidation.errors.join(', ')
  );
  printError(error);
  return error.code;
}
```

**TEST_STRUCTURE:**

```typescript
// SOURCE: packages/cli/tests/config/loader.test.ts:122-138
it('should normalize enterprise network environment variables', () => {
  process.env.HTTP_PROXY = 'http://corp-proxy.internal:8080';
  process.env.HTTPS_PROXY = 'http://corp-proxy.internal:8443';
  process.env.NO_PROXY = ' localhost, 127.0.0.1, internal.local ';
  process.env.NODE_EXTRA_CA_CERTS = ' /etc/ssl/corp-ca.pem ';
  process.env.NODE_USE_ENV_PROXY = 'true';

  const config = loadConfig();

  expect(config.network).toEqual({
    'http-proxy': 'http://corp-proxy.internal:8080',
    'https-proxy': 'http://corp-proxy.internal:8443',
    'no-proxy': ['localhost', '127.0.0.1', 'internal.local'],
    'ca-bundle-path': '/etc/ssl/corp-ca.pem',
    'use-env-proxy': true,
  });
});
```

---

## Architecture Invariants

- Persistent configuration state comes only from `~/.cia/config.json` and `.cia/config.json`; ephemeral invocation state comes only from CLI flags.
- Infrastructure transport env vars (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`) remain first-class runtime inputs.
- Legacy env var ingestion (`CIA_*` and provider auth/default env vars) must be non-functional for config resolution and should fail loudly when detected as migration-blocking inputs.
- Config precedence remains deterministic and idempotent: user config < repo config < CLI flags.
- Error messaging must be actionable and include explicit migration guidance.

---

## Current Best Practices Validation

**Security (Context7 MCP + live advisory verified):**

- [x] Current OWASP recommendations followed (explicit config, no hardcoded secrets)
- [x] Recent advisories checked (`bun audit`, GHSA references)
- [x] Auth guidance remains explicit and non-silent
- [x] Input/network validation remains fail-loud

**Performance (Web intelligence verified):**

- [x] No new runtime dependencies introduced
- [x] Startup path simplified (fewer env parsing branches)
- [x] Existing benchmark gates (`make validate-bench`) remain applicable
- [x] Config loading still O(number of keys), no new expensive I/O

**Community Intelligence:**

- [x] Vitest guidance confirms env stubbing/reset best practice (`vi.stubEnv`/cleanup)
- [x] Node docs confirm `process.env` string semantics and dotenv handling
- [x] No contradictory maintainer guidance found for this migration
- [x] Deprecated implicit configuration pattern is intentionally removed

---

## Files to Change

| File | Action | Justification |
| --- | --- | --- |
| `packages/cli/src/shared/config/loader.ts` | UPDATE | remove legacy env config ingestion; keep infra network env ingestion; add legacy-env detection hooks |
| `packages/cli/src/shared/validation/validation.ts` | UPDATE | remove `CIA_MODEL` suggestion and enforce explicit guidance |
| `packages/cli/src/shared/errors/error-handling.ts` | UPDATE | update migration-focused suggestions; add legacy-env-specific error constructor if needed |
| `packages/cli/src/commands/help.ts` | UPDATE | remove env fallback claims and legacy provider env guidance |
| `packages/cli/src/providers/mcp/manager.ts` | UPDATE | switch debug check from `CIA_LOG_LEVEL` to resolved config/log-level path or neutral runtime behavior |
| `packages/cli/src/providers/claude.ts` | UPDATE | stop treating provider env vars as primary auth source for default behavior; align with explicit config intent |
| `packages/cli/tests/config/loader.test.ts` | UPDATE | replace legacy env-positive tests with legacy env rejection/migration tests |
| `packages/cli/tests/utils/validation.test.ts` | UPDATE | assertion text migration to explicit config guidance |
| `packages/cli/tests/commands/help.test.ts` | UPDATE | assert new precedence/help content |
| `packages/cli/tests/integration/enterprise-network.test.ts` | UPDATE | preserve and extend infra env compatibility checks |
| `packages/cli/tests/integration/legacy-env-cleanup.test.ts` | CREATE | integration contract: legacy env vars rejected, infra env vars still honored |
| `docs/cia-cli-spec.md` | UPDATE | remove legacy env fallback wording; align substitution semantics and migration guidance |
| `docs/legacy-env-migration.md` | CREATE | dedicated breaking-change migration guide |
| `README.md` | UPDATE | ensure quick-start/config docs remove legacy env references and match migration guidance |
| `CHANGELOG.md` | UPDATE | explicit breaking-change note for env cleanup |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- No provider feature expansion (no new providers/models/auth flows outside legacy env cleanup).
- No rewrite of global config schema format beyond migration wording and validation behavior.
- No MCP/skills architecture changes except log-level/env touchpoints directly needed for this phase.
- No dependency upgrade campaign (advisories documented; remediation is separate tracked work).

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: run static validation first, then targeted functional checks, then targeted tests with coverage collection where practical.

**Coverage Target for this phase:** 80%+ on changed modules.

### Task 1: UPDATE `packages/cli/src/shared/config/loader.ts`

- **ACTION**: Remove `CIA_*` and provider auth/default env ingestion from `loadFromEnv()` while retaining `loadNetworkConfigFromEnv()` behavior.
- **IMPLEMENT**: `loadFromEnv()` returns only normalized `network` section (and any non-legacy required infrastructure keys).
- **MIRROR**: `packages/cli/src/shared/config/loader.ts:153-170` network normalization and trimming behavior.
- **GOTCHA**: Keep `loadDotEnvFile()` for explicit config substitution support; do not accidentally remove `.env` preload behavior used by `${ENV_VAR}` substitution.
- **CURRENT**: Node `process.env` semantics are string-based; preserve explicit parsing (`parseInt`, boolean normalization) where still applicable.
- **VALIDATE**: `make validate-l1`
- **FUNCTIONAL**: `HTTP_PROXY=http://proxy.internal:8080 ./dist/cia --help`
- **TEST_PYRAMID**: Add/adjust unit tests for loader-only behavior and precedence invariants.

### Task 2: UPDATE `packages/cli/src/shared/errors/error-handling.ts`

- **ACTION**: Replace legacy env suggestions (`CIA_PROVIDER`) with explicit config/CLI guidance and add dedicated migration error helper if needed.
- **IMPLEMENT**: Update `CommonErrors.missingProvider` and related auth/config suggestion text.
- **MIRROR**: `packages/cli/src/shared/errors/error-handling.ts:37-43` concise message/details/suggestion style.
- **GOTCHA**: Keep exit code mapping unchanged; this is behavior messaging, not code semantics change.
- **VALIDATE**: `npx vitest --run packages/cli/tests/utils/error-handling.test.ts`
- **TEST_PYRAMID**: Unit assertions for updated suggestions and unchanged exit codes.

### Task 3: UPDATE `packages/cli/src/shared/validation/validation.ts`

- **ACTION**: Remove `CIA_MODEL` wording from execution requirement errors.
- **IMPLEMENT**: Message becomes explicit (`Use --model or define model in .cia/config.json`).
- **MIRROR**: `packages/cli/src/shared/validation/validation.ts:227-249` validation aggregation pattern.
- **GOTCHA**: Keep provider/model format checks untouched; only source guidance changes.
- **VALIDATE**: `npx vitest --run packages/cli/tests/utils/validation.test.ts`
- **TEST_PYRAMID**: Unit tests for messaging update and no regression in validation outcomes.

### Task 4: UPDATE `packages/cli/src/commands/help.ts`

- **ACTION**: Rewrite configuration section to remove legacy env precedence and provider-auth env guidance; keep enterprise env section.
- **IMPLEMENT**: precedence should read user config -> repo config -> CLI flags for feature config; infra network env vars documented separately.
- **MIRROR**: Existing grouped console output style in `packages/cli/src/commands/help.ts:104-113`.
- **GOTCHA**: Keep provider list dynamic via `getSupportedProviders()`.
- **VALIDATE**: `npx vitest --run packages/cli/tests/commands/help.test.ts`
- **TEST_PYRAMID**: Update command tests for new wording; retain section coverage.

### Task 5: UPDATE `packages/cli/src/providers/mcp/manager.ts`

- **ACTION**: Remove direct dependency on `process.env.CIA_LOG_LEVEL` in debug toggling.
- **IMPLEMENT**: Use neutral/default debug behavior path that aligns with explicit config (e.g., injected setting, or conservative false unless configured via CLI-config pipeline).
- **MIRROR**: Existing fail-soft logging pattern in `packages/cli/src/providers/mcp/manager.ts:82-99`.
- **GOTCHA**: Do not break enterprise network diagnostics output formatting.
- **VALIDATE**: `npx vitest --run packages/cli/tests/providers/mcp/reliability.test.ts packages/cli/tests/providers/mcp.test.ts`
- **TEST_PYRAMID**: Add unit/integration coverage for diagnostics gating behavior.

### Task 6: UPDATE `packages/cli/src/providers/claude.ts`

- **ACTION**: Reduce provider env fallback behavior as a configuration source; keep only minimal SDK runtime compatibility paths required by subprocess invocation.
- **IMPLEMENT**: Prefer explicit provider config for model/auth where available; ensure no silent provider-default env dependence for CLI config resolution.
- **MIRROR**: `packages/cli/src/providers/claude.ts:52-77` applyNetworkEnv mutation style.
- **GOTCHA**: Preserve support for `CLAUDE_USE_GLOBAL_AUTH` semantics only if strictly required; otherwise document migration impact clearly.
- **VALIDATE**: `npx vitest --run packages/cli/tests/providers.contract.test.ts packages/cli/tests/providers/models.test.ts`
- **TEST_PYRAMID**: Add integration assertion for explicit-config auth path.

### Task 7: UPDATE docs (`docs/cia-cli-spec.md`, `CHANGELOG.md`)

- **ACTION**: Remove legacy env fallback docs and add explicit breaking-change communication.
- **IMPLEMENT**: update Configuration and Environment Variables sections; ensure env substitution syntax and implementation are aligned/documented.
- **MIRROR**: concise operator-focused style already used in `docs/enterprise-network-setup.md`.
- **GOTCHA**: Current code uses `${ENV_VAR}` substitution while docs mention `{env:VAR}`; either implementation or docs must be made consistent and explicitly called out in migration notes.
- **VALIDATE**: `make validate-l1`
- **TEST_PYRAMID**: No code tests required; validate with doc-linked command examples in manual checks.

### Task 8: CREATE `docs/legacy-env-migration.md`

- **ACTION**: Add migration guide from legacy env usage to `.cia/config.json` + CLI flags.
- **IMPLEMENT**: include before/after examples for `CIA_PROVIDER`, `CIA_MODEL`, provider auth env keys; explicitly list preserved infra env vars.
- **MIRROR**: table + shell example style from `docs/enterprise-network-setup.md`.
- **GOTCHA**: include failure examples and expected new error messages.
- **VALIDATE**: `make validate-l1`
- **TEST_PYRAMID**: Manual doc verification with sample commands in Task 11.

### Task 9: UPDATE/CREATE tests (`loader`, `help`, `validation`, integration)

- **ACTION**: Replace legacy-positive tests with migration contracts; add new integration test for legacy env rejection and infra env allowlist preservation.
- **IMPLEMENT**:
  - update `packages/cli/tests/config/loader.test.ts`
  - update `packages/cli/tests/utils/validation.test.ts`
  - update `packages/cli/tests/commands/help.test.ts`
  - create `packages/cli/tests/integration/legacy-env-cleanup.test.ts`
- **MIRROR**: environment setup/restore helper style in `packages/cli/tests/integration/enterprise-network.test.ts:17-43`.
- **GOTCHA**: avoid test leakage by restoring env after each case; prefer `vi.stubEnv` where suitable.
- **VALIDATE**: `npx vitest --run packages/cli/tests/config/loader.test.ts packages/cli/tests/utils/validation.test.ts packages/cli/tests/commands/help.test.ts packages/cli/tests/integration/legacy-env-cleanup.test.ts`
- **TEST_PYRAMID**: unit + integration coverage concentrated on migration behavior.

### Task 10: FINAL docs review/update (`README.md` + docs)

- **ACTION**: Perform final documentation consistency review and update all user-facing docs impacted by legacy env cleanup.
- **IMPLEMENT**: verify `README.md`, `docs/cia-cli-spec.md`, `docs/legacy-env-migration.md`, and `CHANGELOG.md` are aligned on explicit config policy, preserved infrastructure env vars, and migration examples.
- **MIRROR**: concise command/example style in `README.md` and table/shell style in `docs/enterprise-network-setup.md`.
- **GOTCHA**: remove stale references to `CIA_PROVIDER`, `CIA_MODEL`, and provider env fallback wording while keeping `{env:VAR}`/`${VAR}` guidance consistent with implementation.
- **VALIDATE**: `make validate-l1`
- **FUNCTIONAL**: `./dist/cia --help` and confirm help text matches updated docs statements.
- **TEST_PYRAMID**: No additional code tests required; documentation consistency and command-accuracy review only.

### Task 11: Full validation and manual migration smoke

- **ACTION**: Run governed validation levels and manual smoke for migration outcomes.
- **IMPLEMENT**: validate legacy env failure messaging and infra env success path.
- **VALIDATE**: `make validate-l1 && make validate-l2 && make validate-l3`
- **FUNCTIONAL**:
  - `CIA_PROVIDER=codex CIA_MODEL=gpt-4 ./dist/cia run "health-check"` (expect fail-loud migration guidance)
  - `HTTP_PROXY=http://proxy.internal:8080 ./dist/cia run "health-check" --provider codex --model gpt-4` (expect config accepted, network parsed)
- **TEST_PYRAMID**: include critical user journey: CI invocation with explicit config and enterprise proxy vars.

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
| --- | --- | --- |
| `packages/cli/tests/config/loader.test.ts` | ignores `CIA_*`, preserves network env parsing, precedence remains stable | config source policy |
| `packages/cli/tests/utils/validation.test.ts` | updated explicit model guidance, unchanged validation logic | user-facing validation clarity |
| `packages/cli/tests/commands/help.test.ts` | updated precedence/help text, no legacy env references | docs/runtime consistency |
| `packages/cli/tests/utils/error-handling.test.ts` | migration suggestion text and exit code stability | fail-loud UX |

### Integration Tests to Write

| Test File | Test Cases | Validates |
| --- | --- | --- |
| `packages/cli/tests/integration/legacy-env-cleanup.test.ts` | legacy env vars rejected with actionable message | breaking change contract |
| `packages/cli/tests/integration/enterprise-network.test.ts` | infra env vars still accepted and validated | preserved enterprise behavior |

### Edge Cases Checklist

- [ ] `CIA_PROVIDER` set but CLI/config missing provider should fail with migration hint.
- [ ] `CIA_MODEL` set but model missing in explicit config should not silently pass.
- [ ] Both legacy and explicit config provided: explicit config wins, legacy ignored/reported.
- [ ] malformed `HTTP_PROXY` still fails with existing validation errors.
- [ ] multiline `NODE_EXTRA_CA_CERTS` still fails loudly.
- [ ] `.cia/config.json` with `${ENV_VAR}` substitution remains functional after cleanup.

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
```

**EXPECT**: Exit 0, lint + type-check pass.

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make validate-l4
```

**EXPECT**: binary builds and `cia --help` / `cia --version` execute.

### Level 3: UNIT_TESTS

```bash
npx vitest --run packages/cli/tests/config/loader.test.ts packages/cli/tests/utils/validation.test.ts packages/cli/tests/commands/help.test.ts packages/cli/tests/utils/error-handling.test.ts --coverage --collectCoverageFrom="packages/cli/src/shared/config/loader.ts" --collectCoverageFrom="packages/cli/src/shared/validation/validation.ts" --collectCoverageFrom="packages/cli/src/commands/help.ts" --collectCoverageFrom="packages/cli/src/shared/errors/error-handling.ts"
```

**EXPECT**: targeted tests pass, focused module coverage >= 80%.

### Level 4: FULL_SUITE

```bash
make validate-l3
```

**EXPECT**: all tests and build pass.

### Level 5: DATABASE_VALIDATION (if schema changes)

Not applicable.

### Level 6: BROWSER_VALIDATION (if UI changes)

Not applicable.

### Level 7: CURRENT_STANDARDS_VALIDATION

```bash
bun audit
```

**EXPECT**: advisories captured and documented; no new vulnerabilities introduced by this phase.

### Level 8: MANUAL_VALIDATION

1. Create `.cia/config.json` with explicit provider/model and run `cia run` (success path).
2. Export `CIA_PROVIDER`/`CIA_MODEL` only and run `cia run` (expect fail-loud migration guidance).
3. Export `HTTP_PROXY` + `NODE_EXTRA_CA_CERTS` and run with explicit config (expect network normalization path intact).

---

## Acceptance Criteria

- [ ] Legacy env vars (`CIA_*`, provider auth/default env vars) are no longer accepted as config defaults.
- [ ] Infrastructure env vars (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`) continue to work.
- [ ] Validation and help text contain no legacy env fallback instructions.
- [ ] Migration guide and changelog clearly document breaking change and upgrade path.
- [ ] Level 1-4 validation commands pass.
- [ ] New/updated tests enforce migration contracts and enterprise compatibility.
- [ ] No regressions in existing provider and enterprise network tests.

---

## Completion Checklist

- [ ] Tasks executed in dependency order.
- [ ] Static analysis passed after each major code change.
- [ ] Targeted tests added/updated before final full suite.
- [ ] Full suite and build passed.
- [ ] Documentation and changelog updated with breaking change note.
- [ ] Real-time standards check completed and attached.

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 3 resolve calls, 3 docs queries attempted (2 successful docs payloads + 1 version-tag correction needed)
**Web Intelligence Sources**: 4 (Node docs, Vitest latest, Vitest v1.6 docs, GitHub advisory)
**Last Verification**: 2026-02-21T11:52:36Z
**Security Advisories Checked**: 4 surfaced by `bun audit` (minimatch, ajv, esbuild, hono)
**Deprecated Patterns Avoided**: implicit config via `CIA_*`/provider env defaults

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Breaking existing CI jobs that rely on `CIA_*` | HIGH | HIGH | fail-loud migration errors + dedicated migration doc + changelog callout |
| Hidden provider env dependencies in Claude path | MEDIUM | MEDIUM | isolate provider-runtime env behavior and add explicit integration coverage |
| Inconsistency between docs `{env:VAR}` and implementation `${VAR}` | HIGH | MEDIUM | align docs+code in same phase and include manual validation examples |
| Enterprise proxy regressions while removing env defaults | LOW | HIGH | preserve `loadNetworkConfigFromEnv()` contracts and re-run integration suite |
| Existing dependency advisories unrelated to phase distract release | MEDIUM | MEDIUM | document advisories, avoid scope creep, track in follow-up security ticket |

---

## Notes

- This phase is a behavior hardening/breaking-change cleanup, not a feature expansion.
- Keep implementation simple: remove legacy branches, preserve validated enterprise-network path, and provide clear migration UX.
- Prefer explicit errors over silent fallback to satisfy fail-loud principle in `AGENTS.md`.

### Current Intelligence Considerations

- `npm view` check confirms existing pinned/runtime versions are valid in registry at time of planning (no nonexistent versions).
- Latest patch deltas exist for some dependencies (for example, `@ai-sdk/azure` latest `3.0.31` vs current `^3.0.30`), but dependency upgrade is out of scope for Phase 12.
- `bun audit` currently reports vulnerabilities in transitive dependencies; this plan does not add new dependencies and keeps remediation scoped separately.
