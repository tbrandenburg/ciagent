# Feature: Enterprise Network Support

## Summary

Implement phase 8 by adding first-class enterprise network behavior for proxy and certificate handling across provider paths, while preserving existing CIA conventions (config-first loading, fail-loud validation, and console-prefixed diagnostics). The approach threads normalized network settings from config loading into provider construction and MCP transport setup, adds explicit diagnostics and error mapping, and hardens tests for proxy/certificate scenarios without introducing a new logging abstraction.

## User Story

As a DevOps engineer in a restricted enterprise network
I want `cia` to work with `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` and custom CA bundles
So that I can run CI automation through corporate proxies with actionable diagnostics instead of opaque connection failures

## Problem Statement

Phase 8 is still pending, and source code currently has no explicit implementation for `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, or `NODE_EXTRA_CA_CERTS` in `packages/cli/src/**/*.ts`. This creates a testable gap: enterprise users cannot rely on deterministic proxy/certificate behavior or dedicated troubleshooting output.

## Solution Statement

Introduce a minimal network-runtime layer that: (1) normalizes proxy/CA env settings in config loading, (2) applies settings at provider integration points (`providers/index.ts`, `vercel-factory.ts`, `claude.ts`, `providers/mcp/manager.ts`), and (3) maps network failures to consistent CLI errors and diagnostics. Keep implementation additive and pattern-faithful (kebab-case config keys, existing `CommonErrors`, existing test style).

## Metadata

| Field | Value |
|------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | CLI parsing/help, config loader, provider factory, Vercel provider factory, Claude env passthrough, MCP manager, shared errors, tests |
| Dependencies | `@ai-sdk/azure` ^3.0.30 (latest 3.0.31), `@ai-sdk/openai` ^3.0.30 (latest 3.0.30), `ai` ^6.0.86 (latest 6.0.94), `@modelcontextprotocol/sdk` ^1.26.0 (latest 1.26.0), `@openai/codex-sdk` ^0.87.0 (latest 0.104.0), `@anthropic-ai/claude-agent-sdk` ^0.2.7 (latest 0.2.49), `@anthropic-ai/sdk` ^0.74.0 (latest 0.78.0), `p-retry` 7.1.1, `zod` ^4.3.6, `ajv` 8.18.0 |
| Estimated Tasks | 10 |
| **Research Timestamp** | **2026-02-20T14:53:40+01:00** |

---

## UX Design

### Before State

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                                 BEFORE STATE                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  User in corporate network                                                   ║
║       │                                                                      ║
║       ▼                                                                      ║
║  cia run --provider azure "..."                                             ║
║       │                                                                      ║
║       ▼                                                                      ║
║  Provider/MCP calls use implicit runtime behavior only                       ║
║  (no explicit proxy/CA mapping in cia source)                                ║
║       │                                                                      ║
║       ▼                                                                      ║
║  Failure output is mixed generic errors / provider SDK errors                ║
║                                                                              ║
║  USER_FLOW: set env vars -> run command -> opaque network failure            ║
║  PAIN_POINT: cannot distinguish proxy auth vs CA trust vs target outage      ║
║  DATA_FLOW: CLI args -> config -> provider init -> network call (implicit)   ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### After State

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                                  AFTER STATE                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  User in corporate network                                                   ║
║       │                                                                      ║
║       ▼                                                                      ║
║  Export HTTP_PROXY/HTTPS_PROXY/NO_PROXY/NODE_EXTRA_CA_CERTS                 ║
║       │                                                                      ║
║       ▼                                                                      ║
║  cia run --log-level DEBUG --provider azure "..."                           ║
║       │                                                                      ║
║       ▼                                                                      ║
║  Config loader normalizes enterprise network settings                        ║
║       │                                                                      ║
║       ├──► Provider paths apply proxy/CA behavior consistently               ║
║       └──► Diagnostics emit resolved mode and actionable hints               ║
║       ▼                                                                      ║
║  Clear outcome: success through proxy OR specific network error category     ║
║                                                                              ║
║  USER_FLOW: set env -> run -> receive deterministic diagnostics              ║
║  VALUE_ADD: faster triage, fewer false config guesses, reliable CI behavior  ║
║  DATA_FLOW: env/config -> normalized network config -> provider transport     ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes

| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `packages/cli/src/shared/config/loader.ts` | No explicit enterprise network keys | Proxy/CA env parsed + normalized | Predictable runtime behavior |
| `packages/cli/src/providers/vercel-factory.ts` | Relies on default global fetch behavior | Explicit provider fetch/transport strategy for proxy and CA | Azure/OpenAI provider calls work in corp networks |
| `packages/cli/src/providers/claude.ts` | Subprocess env pass-through but no diagnostics context | Network env forwarding clarified + debug traces | Easier Claude-side troubleshooting |
| `packages/cli/src/providers/mcp/manager.ts` | Remote transport built without enterprise network visibility | Remote transport diagnostics include proxy/cert context | MCP failures become actionable |
| `packages/cli/src/shared/errors/error-handling.ts` | Generic network suggestions | Proxy/CA-specific failure guidance | Faster failure remediation |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/shared/config/loader.ts` | 57-140 | Existing config precedence and env mapping to mirror exactly |
| P0 | `packages/cli/src/providers/index.ts` | 21-59 | Provider factory composition and wrappers integration point |
| P0 | `packages/cli/src/providers/mcp/manager.ts` | 230-302 | Remote transport setup + failure behavior |
| P1 | `packages/cli/src/providers/claude.ts` | 24-49 | Subprocess env shaping convention |
| P1 | `packages/cli/src/shared/errors/error-handling.ts` | 36-247 | `CommonErrors` pattern and suggestion style |
| P1 | `packages/cli/src/utils/exit-codes.ts` | 4-25 | Exit-code contract that error additions must preserve |
| P2 | `packages/cli/tests/config/loader.test.ts` | 1-122 | Config test style and env setup pattern |
| P2 | `packages/cli/tests/providers/mcp/reliability.test.ts` | 33-88 | Transient network retry test pattern |
| P2 | `packages/cli/tests/e2e.test.ts` | 10-30 | Integration test gating convention |

**Current External Documentation (Verified Live):**

| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [Node CLI v25](https://nodejs.org/api/cli.html#node_use_env_proxy1) ✓ Current | `NODE_USE_ENV_PROXY` | Confirms current Node runtime proxy toggle behavior | 2026-02-20T13:59:47+01:00 |
| [Node CLI v25](https://nodejs.org/api/cli.html#node_extra_ca_certsfile) ✓ Current | `NODE_EXTRA_CA_CERTS` | Confirms current custom trust bundle behavior | 2026-02-20T13:59:47+01:00 |
| [Bun Fetch](https://bun.sh/docs/api/fetch#proxying-requests) ✓ Current | `fetch` proxy option | Confirms Bun-specific explicit proxy support | 2026-02-20T13:59:47+01:00 |
| [Undici ProxyAgent](https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md) ✓ Current | `ProxyAgent` usage | Confirms explicit dispatcher approach for proxied fetch | 2026-02-20T13:59:47+01:00 |
| [Undici EnvHttpProxyAgent (Context7)](https://github.com/nodejs/undici/blob/main/docs/docs/api/EnvHttpProxyAgent.md) ✓ Current | env-driven proxy agent | Confirms first-class `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` dispatcher path | 2026-02-20T14:53:40+01:00 |
| [AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai) ✓ Current | `createOpenAI({ baseURL, fetch })` | Verifies extension point for proxy-aware fetch injection | 2026-02-20T13:59:47+01:00 |
| [AI SDK Azure provider](https://ai-sdk.dev/providers/ai-sdk-providers/azure) ✓ Current | `createAzure({ baseURL, fetch })` | Verifies extension point for enterprise network behavior | 2026-02-20T13:59:47+01:00 |
| [MCP TS SDK client transports (Context7)](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md) ✓ Current | StreamableHTTP/SSE/Stdio connect pattern | Validates transport fallback design and compatibility assumptions | 2026-02-20T14:53:40+01:00 |
| [OpenAI Node `fetchOptions` migration (Context7)](https://github.com/openai/openai-node/blob/master/MIGRATION.md) ✓ Current | `httpAgent` removed in favor of fetch options | Reinforces dispatcher-based proxy approach used in modern fetch stacks | 2026-02-20T14:53:40+01:00 |
| [OWASP SSRF Attack](https://owasp.org/www-community/attacks/Server_Side_Request_Forgery) ✓ Current | SSRF overview + prevention pointer | Keeps URL/network diagnostics aligned with current security model | 2026-02-20T13:59:47+01:00 |

---

## Patterns to Mirror

**NAMING_CONVENTION:**

```typescript
// SOURCE: packages/cli/src/cli.ts:33-40
'retry-backoff': { type: 'boolean' },
timeout: { type: 'string' },
'log-level': { type: 'string' },
```

**ERROR_HANDLING:**

```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:93-107
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
// SOURCE: packages/cli/src/commands/run.ts:511-513
console.log(
  `[Status] MCP: ${connectedServers}/${serverCount} servers connected, ${toolCount} tools available`
);
```

**REPOSITORY_PATTERN (config ingestion equivalent):**

```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:57-70
export function loadConfig(cliArgs: Partial<CIAConfig> = {}): CIAConfig {
  let config = loadFromEnv();
  const userConfig = loadUserConfig();
  if (userConfig) {
    config = mergeConfigs(config, userConfig);
  }
  const repoConfig = loadRepoConfig();
  if (repoConfig) {
    config = mergeConfigs(config, repoConfig);
  }
  config = mergeConfigs(config, cliArgs);
  return config;
}
```

**SERVICE_PATTERN (provider composition equivalent):**

```typescript
// SOURCE: packages/cli/src/providers/index.ts:40-59
const structuredConfig = config ? loadStructuredConfig(config) : undefined;
const providerConfig = structuredConfig?.providers?.[provider];

if (VERCEL_PROVIDERS.includes(provider)) {
  assistantChat = await VercelAssistantChat.create(provider, providerConfig);
} else if (provider === 'codex') {
  assistantChat = await CodexAssistantChat.create(providerConfig);
} else if (provider === 'claude') {
  assistantChat = await ClaudeAssistantChat.create(providerConfig);
}

if (config && (config.retries || config['contract-validation'] || config['retry-timeout'])) {
  assistantChat = new ReliableAssistantChat(assistantChat, config);
}
```

**TEST_STRUCTURE:**

```typescript
// SOURCE: packages/cli/tests/config/loader.test.ts:13-30
beforeEach(() => {
  process.env.HOME = testUserHome;
  if (existsSync(testUserConfigFile)) unlinkSync(testUserConfigFile);
  if (existsSync(testUserConfigDir)) rmSync(testUserConfigDir, { recursive: true, force: true });
  if (existsSync(repoConfigFile)) unlinkSync(repoConfigFile);
  if (existsSync(repoConfigDir)) rmSync(repoConfigDir, { recursive: true, force: true });
});
```

---

## Architecture Invariants

- Persistent state remains file-based config (`~/.cia/config.json`, `.cia/config.json`); proxy/cert settings are runtime-resolved and ephemeral.
- Provider execution remains idempotent per invocation: same effective config/env yields same transport behavior.
- Fail loud and early: malformed enterprise network inputs surface explicit validation/config errors, not silent fallback.
- Existing provider abstraction remains intact: no new provider interface required for phase 8.

---

## Current Best Practices Validation

**Security (Live-verified):**

- [x] Network error guidance remains specific and non-secret-leaking (do not print proxy credentials)
- [x] SSRF awareness preserved (current code already validates URLs in context flows)
- [x] Avoid insecure global disablement (no recommendation to use `NODE_TLS_REJECT_UNAUTHORIZED=0`)
- [x] CA trust extension uses `NODE_EXTRA_CA_CERTS` guidance, not custom insecure bypasses

**Performance (Live-verified):**

- [x] Prefer configuration-time wiring over per-request branching in hot paths
- [x] Keep connection reuse behavior intact unless proxy semantics require otherwise
- [x] Avoid introducing extra retries beyond existing reliability wrappers
- [x] Keep diagnostics optional/gated by log level to reduce noisy IO

**Community Intelligence:**

- [x] Undici proxy usage remains `ProxyAgent` + dispatcher pattern
- [x] Bun `fetch` supports explicit `proxy` option; useful in Bun runtime paths
- [x] Stack Overflow activity indicates proxy misconfiguration is a recurring operational issue; diagnostics must name resolution path
- [x] No evidence of deprecation for selected proxy/cert primitives in current docs

---

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `packages/cli/src/shared/config/loader.ts` | UPDATE | Add normalized enterprise network config ingestion + types |
| `packages/cli/src/shared/validation/validation.ts` | UPDATE | Validate any new network-related config fields and enforce fail-loud behavior |
| `packages/cli/src/providers/index.ts` | UPDATE | Thread normalized network options into provider creation pipeline |
| `packages/cli/src/providers/vercel-factory.ts` | UPDATE | Apply proxy/CA strategy for AI SDK provider transport |
| `packages/cli/src/providers/claude.ts` | UPDATE | Keep subprocess env explicit and diagnostics-aware for network vars |
| `packages/cli/src/providers/mcp/manager.ts` | UPDATE | Add transport-level diagnostics and proxy/cert awareness |
| `packages/cli/src/shared/errors/error-handling.ts` | UPDATE | Add standardized proxy/certificate error constructors/suggestions |
| `packages/cli/src/commands/help.ts` | UPDATE | Document enterprise network troubleshooting surface |
| `packages/cli/tests/config/loader.test.ts` | UPDATE | Add env precedence/normalization tests for proxy and CA vars |
| `packages/cli/tests/providers/mcp/reliability.test.ts` | UPDATE | Add proxy/cert transient and non-transient failure classification tests |
| `packages/cli/tests/providers.contract.test.ts` | UPDATE | Ensure provider composition remains contract-safe with network config |
| `packages/cli/tests/e2e.test.ts` | UPDATE | Add gated enterprise-network smoke checks for diagnostics messaging |

---

## NOT Building (Scope Limits)

- No PAC/WPAD or advanced proxy auto-discovery logic.
- No global logger refactor; stick to existing `console.*` + prefix conventions.
- No transport rewrite for every provider SDK; apply minimal integration through current extension points.
- No new persistent secrets storage for proxy credentials.

---

## Step-by-Step Tasks

Execute top-to-bottom. After each task: run static checks and targeted tests.

### Task 1: Update `packages/cli/src/shared/config/loader.ts`

- **ACTION**: Extend `CIAConfig` with an explicit `network` section (proxy + CA metadata) while preserving existing top-level config style.
- **IMPLEMENT**: Parse `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS` into normalized config fields during `loadFromEnv`.
- **MIRROR**: `packages/cli/src/shared/config/loader.ts:75-140` env-mapping style.
- **GOTCHA**: Keep config precedence intact (`env -> user -> repo -> cli args`).
- **CURRENT**: Node docs list `NODE_EXTRA_CA_CERTS` and `NODE_USE_ENV_PROXY`; Bun docs support explicit fetch proxy.
- **VALIDATE**: `make validate-l1 && bun test packages/cli/tests/config/loader.test.ts --run`
- **TEST_PYRAMID**: Add integration-style config merge tests for network fields.

### Task 2: Update `packages/cli/src/shared/validation/validation.ts`

- **ACTION**: Validate normalized network entries (valid URL format for proxies, safe handling of empty values).
- **IMPLEMENT**: Add explicit validation errors for malformed proxy URLs or unusable CA bundle path format.
- **MIRROR**: existing error accumulation pattern in `validateConfig`.
- **GOTCHA**: Do not over-validate filesystem existence for CA at parse-time if it breaks containerized CI assumptions; validate format + actionable errors.
- **VALIDATE**: `make validate-l1 && bun test packages/cli/tests/config/loader.test.ts --run`
- **TEST_PYRAMID**: Unit tests for malformed values and expected error strings.

### Task 3: Update `packages/cli/src/providers/index.ts`

- **ACTION**: Thread normalized network runtime options through provider creation.
- **IMPLEMENT**: Pass network config into `VercelAssistantChat.create` and other relevant provider constructors without changing public CLI contract.
- **MIRROR**: `structuredConfig` lookup + wrapper layering pattern.
- **GOTCHA**: Preserve schema/reliability wrapper order.
- **VALIDATE**: `make validate-l1 && bun test packages/cli/tests/providers.contract.test.ts --run`
- **TEST_PYRAMID**: Contract test confirms no chunk-type regressions.

### Task 4: Update `packages/cli/src/providers/vercel-factory.ts`

- **ACTION**: Support proxy/CA-aware transport wiring for Azure/OpenAI provider creation.
- **IMPLEMENT**: Use provider SDK `fetch` override hook when proxy config is active; keep default fast path when not configured.
- **MIRROR**: existing per-provider `createX` switch-case style.
- **GOTCHA**: Avoid leaking proxy credentials in thrown errors or logs.
- **CURRENT**: AI SDK docs confirm `createOpenAI`/`createAzure` accept custom `fetch` and `baseURL`; Context7 confirms Undici `EnvHttpProxyAgent` is a current env-driven dispatcher option.
- **VALIDATE**: `make validate-l1 && bun test packages/cli/tests/providers.contract.test.ts --run`
- **TEST_PYRAMID**: Integration tests around proxy-enabled provider config.

### Task 5: Update `packages/cli/src/providers/claude.ts`

- **ACTION**: Keep subprocess env explicit for enterprise network variables and diagnostics.
- **IMPLEMENT**: Ensure `buildSubprocessEnv()` behavior is deterministic for proxy/cert env forwarding.
- **MIRROR**: existing auth-stripping + pass-through pattern.
- **GOTCHA**: Do not unintentionally strip proxy vars when stripping auth vars.
- **VALIDATE**: `make validate-l1 && bun test packages/cli/tests/providers.contract.test.ts --run`
- **TEST_PYRAMID**: Unit tests for env shaping behavior.

### Task 6: Update `packages/cli/src/providers/mcp/manager.ts`

- **ACTION**: Add network diagnostics context for remote MCP connections.
- **IMPLEMENT**: Emit focused diagnostics (proxy active, CA bundle configured, transport in use) under debug/log-level gating.
- **MIRROR**: current `[MCP]` prefixed status logging.
- **GOTCHA**: Keep MCP initialization non-blocking semantics where currently intended.
- **VALIDATE**: `make validate-l1 && bun test packages/cli/tests/providers/mcp/reliability.test.ts --run`
- **TEST_PYRAMID**: Integration-like tests for connection failure classification.

### Task 7: Update `packages/cli/src/shared/errors/error-handling.ts`

- **ACTION**: Add enterprise-network-focused `CommonErrors` entries.
- **IMPLEMENT**: `proxyConfigurationInvalid`, `proxyConnectionFailed`, `caBundleInvalid`, `certificateValidationFailed` with clear suggestions.
- **MIRROR**: existing `CommonErrors.*` shape and exit code mapping.
- **GOTCHA**: Keep exit code usage aligned with `ExitCode.AUTH_CONFIG` vs `ExitCode.LLM_EXECUTION` semantics.
- **VALIDATE**: `make validate-l1 && bun test packages/cli/tests/providers/mcp/reliability.test.ts --run`
- **TEST_PYRAMID**: Unit tests for generated error payloads.

### Task 8: Update `packages/cli/src/commands/help.ts`

- **ACTION**: Add concise enterprise network troubleshooting section.
- **IMPLEMENT**: Document supported env vars and intended usage, plus pointer to debug output.
- **MIRROR**: existing help text grouping style.
- **GOTCHA**: Keep docs consistent with `docs/cia-cli-spec.md` constraints.
- **VALIDATE**: `make validate-l1 && bun test packages/cli/tests/e2e.test.ts --run`
- **TEST_PYRAMID**: E2E help snapshot assertion (gated).

### Task 9: Update tests (`loader`, `providers.contract`, `mcp/reliability`, `e2e`)

- **ACTION**: Add high-signal tests only.
- **IMPLEMENT**:
  - config precedence/merge for network vars,
  - provider factory pass-through behavior,
  - transient vs non-transient proxy/cert failure cases,
  - gated E2E diagnostics.
- **MIRROR**: existing Vitest patterns with env-gated suites.
- **GOTCHA**: avoid flaky network calls; keep tests local/mocked.
- **VALIDATE**: `make validate-l2 && make validate-l3`
- **TEST_PYRAMID**: 70/20/10 alignment preserved; no redundant test duplication.

### Task 10: Full validation and standards re-check

- **ACTION**: Execute full CI-level validation and re-check doc currency before merge.
- **IMPLEMENT**: run full suite, build, binary smoke checks, and dependency audit.
- **VALIDATE**: `make validate-all && make ci-full && bun audit`
- **TEST_PYRAMID**: Confirms end-to-end system confidence and no regressions.

---

## Testing Strategy

### Unit Tests to Write

| Test File | Test Cases | Validates |
|----------|------------|-----------|
| `packages/cli/tests/config/loader.test.ts` | proxy env parsing, no_proxy parsing, ca env parsing, precedence with config files | Config normalization and hierarchy |
| `packages/cli/tests/providers/mcp/reliability.test.ts` | proxy timeout vs cert failure classification | Reliability decisions for network errors |
| `packages/cli/tests/providers.contract.test.ts` | provider factory with network config still emits valid chunk contracts | No provider contract regressions |
| `packages/cli/tests/e2e.test.ts` | gated debug diagnostics include enterprise hints | User-facing diagnostics behavior |

### Edge Cases Checklist

- [ ] `HTTP_PROXY` set, `HTTPS_PROXY` unset (fallback behavior documented and tested)
- [ ] `NO_PROXY` with multiple comma-separated hosts and spaces
- [ ] `NODE_EXTRA_CA_CERTS` set to unreadable path
- [ ] Proxy URL includes credentials (diagnostics must redact)
- [ ] Proxy auth failure vs DNS failure have distinguishable messages
- [ ] MCP remote transport fallback path still works under proxy

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
```

**EXPECT**: Exit 0, no lint/type-check errors

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make build && ./dist/cia --help && ./dist/cia --version
```

**EXPECT**: Build succeeds and binary responds correctly

### Level 3: UNIT_TESTS

```bash
bun test --run packages/cli/tests/config/loader.test.ts packages/cli/tests/providers/mcp/reliability.test.ts packages/cli/tests/providers.contract.test.ts
```

**EXPECT**: All targeted tests pass

### Level 4: FULL_SUITE

```bash
make validate-l3
```

**EXPECT**: Full tests and build succeed

### Level 5: DATABASE_VALIDATION

Not applicable (no schema/database changes)

### Level 6: CURRENT_STANDARDS_VALIDATION

```bash
bun audit
```

**EXPECT**: Vulnerability report reviewed; plan records any residual advisories and mitigation posture

### Level 7: MANUAL_VALIDATION

1. Set `HTTP_PROXY`/`HTTPS_PROXY` to known proxy and run `cia run --provider azure ...`.
2. Set invalid proxy URL and verify explicit config/diagnostic error.
3. Set `NODE_EXTRA_CA_CERTS` to valid custom CA and run provider call.
4. Set unreadable CA path and verify actionable failure hint.
5. Repeat for MCP remote server path with `cia mcp list` or run flow that initializes MCP.

---

## Acceptance Criteria

- [ ] Enterprise network env vars are recognized and applied in provider execution paths
- [ ] Diagnostics clearly distinguish proxy misconfiguration, connectivity, and cert trust failures
- [ ] Validation levels 1-4 pass
- [ ] Existing provider contract tests remain green
- [ ] No regression in MCP initialization behavior
- [ ] Help output documents enterprise network behavior without conflicting with CLI spec
- [ ] No new deprecated patterns introduced

---

## Completion Checklist

- [ ] Tasks executed in dependency order
- [ ] Each task validated immediately
- [ ] `make validate-l1` passes
- [ ] `make validate-l2` passes
- [ ] `make validate-l3` passes
- [ ] `make validate-l4` passes
- [ ] `bun audit` findings reviewed and documented
- [ ] Manual enterprise-network checks completed

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 7 successful (4 resolve-library + 3 query-docs)
**Web Intelligence Sources**: 7
**Last Verification**: 2026-02-20T14:53:40+01:00
**Security Advisories Checked**: 4 (`bun audit`)
**Deprecated Patterns Avoided**: global TLS disablement (`NODE_TLS_REJECT_UNAUTHORIZED=0`), silent fallback network behavior

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Provider SDKs differ in proxy hook behavior | MEDIUM | HIGH | Centralize proxy strategy in `vercel-factory.ts`, add contract tests |
| Overly noisy diagnostics in CI logs | MEDIUM | MEDIUM | Gate detailed diagnostics by `log-level`/debug mode |
| CA path validation too strict for containers | MEDIUM | MEDIUM | Validate format eagerly; defer hard file checks to runtime with clear errors |
| Existing vulnerabilities in dependency graph | HIGH | MEDIUM | Record `bun audit` output; update vulnerable transitive deps in follow-up hardening PR |

---

## Notes

- `docs/cia-cli-spec.md:226-235` says only infrastructure env vars should remain supported; this phase should move implementation closer to that spec while preserving current behavior safely.
- Current codebase still supports many `CIA_*` env vars; enterprise network support should be additive and not blocked on phase 12 legacy cleanup.

### Current Intelligence Considerations

- Node documentation now explicitly lists `NODE_USE_ENV_PROXY` alongside proxy/cert envs; runtime assumptions should be made explicit in diagnostics.
- Bun fetch supports explicit `proxy` and TLS options, providing a viable Bun-native path without introducing additional HTTP client dependencies.
- Vercel AI provider docs confirm `fetch` injection and `baseURL` override points are current and suitable for enterprise transport customization.
