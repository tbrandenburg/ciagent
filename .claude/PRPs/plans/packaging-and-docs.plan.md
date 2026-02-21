# Feature: Packaging and Documentation (Phase 11)

## Summary

Phase 11 makes `cia` shippable and operable outside the development repo by adding a production-ready container packaging path, tightening onboarding docs, and explicitly solving GitHub Issue #8 (`Binary Size Bloat: 103MB`). The approach mirrors existing project patterns (Makefile-governed validation, Bun compile pipeline, explicit fail-loud behavior, artifact workflows) and extends them with a size-optimization workstream, binary-size guardrails, and a minimal multi-stage Docker flow.

## User Story

As a DevOps engineer adopting `cia` in CI/CD
I want a reproducible binary and container package with clear docs
So that I can integrate `cia` into GitHub Actions or GitLab CI in minutes.

## Problem Statement

The repo already compiles a Bun binary and has strong CI checks, but there is no first-class Docker packaging path, no explicit enterprise setup guide document, and no changelog bootstrap for release communication. In addition, Issue #8 reports `dist/cia` at ~103MB (currently ~123MB in this workspace), breaching size expectations and causing deployment overhead. This blocks Phase 11 success (`docker run ciagent:latest cia --version`) and leaves binary-size risk unmanaged.

## Solution Statement

Add a lean multi-stage Docker packaging path around the existing Bun binary build, add container-focused docs/CI snippets, bootstrap `CHANGELOG.md`, and introduce a dedicated Issue #8 remediation track: optimize release build flags, measure size impact with controlled benchmark commands, and enforce binary/container size gates in CI. Keep implementation practical, measurable, and aligned with existing Makefile/workflow conventions.

## Metadata

| Field | Value |
| --- | --- |
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | `Dockerfile`, `.dockerignore`, `README.md`, `docs/`, `Makefile`, `.github/workflows/`, `package.json`, `packages/cli/package.json`, benchmark/test scripts |
| Dependencies | `bun@1.3.9` (verified), `oven/bun:1.3.9` + `oven/bun:1.3.9-slim` image tags (verified), existing npm dependencies unchanged |
| Estimated Tasks | 11 |
| **Research Timestamp** | **2026-02-21T09:02:00Z** |

---

## UX Design

### Before State

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                                BEFORE STATE                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Dev installs repo ──► make build ──► dist/cia exists (~100MB+)               ║
║         │                                                                    ║
║         └── no size gate + no first-class Docker packaging/docs               ║
║                                                                              ║
║  USER_FLOW: infer container/release usage from scattered files               ║
║  PAIN_POINT: binary-size bloat unresolved, packaging/docs fragmented          ║
║  DATA_FLOW: build artifacts exist, docs and release metadata incomplete      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### After State

```text
╔══════════════════════════════════════════════════════════════════════════════╗
║                                 AFTER STATE                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Dev/CI runner ──► size-optimized build profile ──► docker build             ║
║                     │                                                        ║
║                     ├──► binary/container size checks in CI                  ║
║                     ├──► docker run ciagent:latest cia --version             ║
║                     └──► README + enterprise guide + changelog give path     ║
║                                                                              ║
║  USER_FLOW: copy/paste quickstart for local, GitHub Actions, GitLab CI      ║
║  VALUE_ADD: one-pass packaging + measurable issue #8 resolution path         ║
║  DATA_FLOW: source -> compiled binary -> slim runtime container + docs       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes

| Location | Before | After | User Impact |
| --- | --- | --- | --- |
| `README.md` | broad dev-focused guide | includes packaging quickstart + CI snippets + issue #8 size guidance | faster adoption in workflows |
| `docs/` | benchmark + CLI spec only | adds enterprise network setup guide and links | clear proxy/CA setup path |
| root packaging files | no Dockerfile or `.dockerignore` | reproducible multi-stage container packaging | `docker run ... cia --version` path exists |
| build outputs | binary size unmanaged | binary and container budgets validated in CI | regressions fail fast |
| release metadata | no changelog | `CHANGELOG.md` bootstrap for release communication | safer upgrades and traceability |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
| --- | --- | --- | --- |
| P0 | `package.json` | 10-24 | canonical build/lint/test scripts and CI contract |
| P0 | `Makefile` | 47-83 | governed validation levels + CI target conventions |
| P0 | `.github/workflows/release.yml` | 26-49 | existing multi-platform Bun build/release pattern |
| P1 | `.github/workflows/ci.yml` | 40-70 | artifact naming/retention conventions |
| P1 | `README.md` | 5-25 | quick-start tone and command-block style |
| P1 | `README.md` | 251-274 | command table style to mirror |
| P2 | `scripts/benchmarks/run-cli-startup.sh` | 13-21 | fail-loud shell pattern |
| P2 | `packages/cli/tests/integration/enterprise-network.test.ts` | 53-113 | enterprise proxy/CA behavior expectations |
| P2 | `packages/cli/tests/benchmarks/cli-startup.test.ts` | 12-17 | budget-style perf testing pattern |

**Issue Context (must include in implementation reasoning):**

- `https://github.com/tbrandenburg/ciagent/issues/8`
- Core claim to resolve: binary bloat blocks packaging targets.
- Use measured outcomes and CI gates; do not close issue based on assumptions.

**Current External Documentation (Verified Live):**

| Source | Section | Why Needed | Last Verified |
| --- | --- | --- | --- |
| [Bun Executables](https://bun.sh/docs/bundler/executables#single-file-executable) | compile + `--target` + `--bytecode` | keep Bun build flags current and non-deprecated | 2026-02-21T08:50:00Z |
| [Bun Docker Guide](https://bun.sh/guides/ecosystem/docker) | multi-stage Bun images + `.dockerignore` | align containerization with Bun-maintainer guidance | 2026-02-21T08:51:00Z |
| [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/#use-multi-stage-builds) | stage separation and copy semantics | ensure minimal runtime image and clean build artifacts | 2026-02-21T08:47:00Z |
| [GitHub Actions Artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data#uploading-build-and-test-artifacts) | artifact naming and retention | preserve consistency with existing CI release process | 2026-02-21T08:48:00Z |
| [GitLab CI YAML](https://docs.gitlab.com/ee/ci/yaml/#keywords) | jobs/artifacts syntax | keep README GitLab examples current | 2026-02-21T08:52:00Z |
| [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html#rule-2-set-a-user) | non-root runtime + hardening checks | prevent unsafe Docker defaults in docs and examples | 2026-02-21T08:49:00Z |
| [Bun Bytecode Guide](https://bun.sh/docs/bundler/bytecode#usage) | bytecode startup/size tradeoffs | decide release profile defaults for issue #8 | 2026-02-21T09:02:00Z |
| [Issue #8 API](https://api.github.com/repos/tbrandenburg/ciagent/issues/8) | current requirement and acceptance baseline | keep phase scope tied to open issue goals | 2026-02-21T09:00:00Z |

---

## Patterns to Mirror

**BUILD_PIPELINE_PATTERN:**

```json
// SOURCE: package.json:16-23
"build": "npm run build:cli",
"build:cli": "cd packages/cli && bun build --compile --minify --sourcemap --bytecode src/cli.ts --outfile ../../dist/cia",
"ci": "npm run lint && npm run type-check && vitest run && echo 'Build step skipped (requires Bun)'"
```

**GOVERNED_VALIDATION_PATTERN:**

```make
// SOURCE: Makefile:47-55
validate-l1: ## Level 1: Static analysis
	bun run type-check && bun run lint

validate-l3: ## Level 3: Full suite
	npx vitest --run && bun run build
```

**README_COMMAND_BLOCK_PATTERN:**

```text
// SOURCE: README.md:7-25
# Build CLI binary
make build

# Run full CI validation
make ci
```

**README_COMMAND_TABLE_PATTERN:**

```md
// SOURCE: README.md:253-257
| Command | Description |
|---------|-------------|
| `cia run <prompt>` | Execute AI prompt with optional context |
| `cia models` | List available AI models |
```

**WORKFLOW_ARTIFACT_PATTERN:**

```yaml
// SOURCE: .github/workflows/ci.yml:64-70
- name: Upload binary artifact
  uses: actions/upload-artifact@v4
  with:
    name: cia-binary-${{ github.sha }}
    path: dist/cia
```

**FAIL_LOUD_SHELL_PATTERN:**

```bash
// SOURCE: scripts/benchmarks/run-cli-startup.sh:18-21
if [[ ! -x "${BINARY_PATH}" ]]; then
  echo "[bench] error: binary not available at ${BINARY_PATH}" >&2
  exit 1
fi
```

**ENTERPRISE_NETWORK_EXPECTATION_PATTERN:**

```ts
// SOURCE: packages/cli/tests/integration/enterprise-network.test.ts:64-70
expect(config.network).toEqual({
  'http-proxy': 'http://proxy.internal:8080',
  'https-proxy': 'https://secure-proxy.internal:8443',
  'no-proxy': ['localhost', '127.0.0.1', '.internal'],
  'ca-bundle-path': '/etc/ssl/certs/corporate.pem',
  'use-env-proxy': true,
});
```

---

## Current Best Practices Validation

**Security (Context7 + Web + live audit verified):**

- [x] OWASP Docker guidance reviewed (non-root user, no privileged runtime defaults, supply-chain awareness)
- [x] Docker packaging plan uses multi-stage separation and non-root runtime user
- [x] `bun audit` executed; 4 advisories identified and documented for mitigation visibility
- [x] No new runtime secrets mechanism introduced; existing env/config model preserved

**Performance (Context7/Web + issue telemetry verified):**

- [x] Bun compile flags in use (`--compile --minify --sourcemap --bytecode`) remain current
- [x] Docker multi-stage strategy reduces runtime image surface and size
- [x] Existing benchmark lane (`make validate-bench`) retained as regression guard
- [x] Packaging changes avoid introducing startup-time regressions in CLI entrypoint
- [x] Issue #8 size baseline captured and converted into explicit validation gates

**Community Intelligence:**

- [x] GitHub Actions artifact practices reviewed and aligned with existing workflow patterns
- [x] GitLab CI YAML reference reviewed for valid example syntax in docs
- [x] Docker/Bun official docs cross-checked; no conflicting recommendation with current repo patterns
- [x] Deprecated pattern avoided: single-stage images carrying full build toolchain

---

## Files to Change

| File | Action | Justification |
| --- | --- | --- |
| `Dockerfile` | CREATE | multi-stage Bun packaging path for `cia` binary |
| `.dockerignore` | CREATE | reduce build context, improve build performance/security |
| `README.md` | UPDATE | packaging quick start + GitHub/GitLab CI snippets + doc links |
| `docs/enterprise-network-setup.md` | CREATE | explicit enterprise proxy and CA setup guide |
| `docs/cia-cli-spec.md` | UPDATE | ensure API docs section links and exit-code/flag references stay synchronized |
| `Makefile` | UPDATE | add governed docker validation target(s) without breaking existing CI |
| `.github/workflows/release.yml` | UPDATE | add Docker packaging validation/release step(s) consistent with current release flow |
| `package.json` | UPDATE | add size-check and release-build scripts for issue #8 |
| `packages/cli/package.json` | UPDATE | separate release build profile from dev profile to reduce artifact size |
| `scripts/check-binary-size.sh` | CREATE | fail-loud binary-size gate with configurable threshold |
| `packages/cli/tests/benchmarks/binary-size.test.ts` | CREATE | CI-friendly regression test for output size |
| `CHANGELOG.md` | CREATE | release/change communication bootstrap for phase completion |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- Multi-registry image publication matrix (GHCR + Docker Hub + ECR) in this phase.
- Full SBOM/signing/attestation pipeline rollout (can follow once packaging path stabilizes).
- Runtime behavior changes in CLI commands/providers; this phase is packaging/docs-focused.
- New provider features or MCP/skills changes.
- Rewriting provider SDK stack to chase binary-size reduction; this phase optimizes packaging/build profile only.

---

## Architecture Invariants

- `cia` remains a stateless CLI with the existing command/exit-code contract.
- Build source of truth remains Bun compile output at `dist/cia`.
- Binary-size checks are deterministic and fail-loud in CI/release paths.
- Container image is an execution wrapper around the compiled CLI, not a new runtime architecture.
- Validation remains Makefile-governed first (`make validate-*`, `make ci`).
- Enterprise network behavior remains environment-variable driven (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`).

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: run static checks first, then functional check. Use Makefile targets where available.

**Coverage Target for this phase**: keep global threshold at current project baseline (40% in `vitest.config.ts`).

### Task 1: UPDATE `package.json` and `packages/cli/package.json` for issue #8 build profiles

- **ACTION**: split build profiles into `build:dev` and `build:release`
- **IMPLEMENT**: release profile disables non-essential debug payload (`--sourcemap`) and preserves functional requirements; keep startup-sensitive options validated by benchmarks
- **MIRROR**: existing build script style in `package.json:16-23` and `packages/cli/package.json:10-15`
- **GOTCHA**: avoid unsupported assumptions (for Bun compile, runtime is bundled; externalization must be verified before use)
- **VALIDATE**: `make build && ./dist/cia --version`
- **FUNCTIONAL**: compare `ls -lh dist/cia` before/after release profile
- **TEST_PYRAMID**: no new unit tests; requires benchmark and size regression checks

### Task 2: CREATE `scripts/check-binary-size.sh`

- **ACTION**: add fail-loud binary size check utility for issue #8
- **IMPLEMENT**: check `dist/cia` against configurable byte threshold with clear error output
- **MIRROR**: fail-loud shell pattern from `scripts/benchmarks/run-cli-startup.sh:13-21`
- **GOTCHA**: cross-platform `stat` compatibility (`-c%s` Linux / `-f%z` BSD)
- **VALIDATE**: `bash scripts/check-binary-size.sh`
- **FUNCTIONAL**: run script with strict threshold to ensure failure path is explicit
- **TEST_PYRAMID**: no additional tests required for script-only utility

### Task 3: CREATE `packages/cli/tests/benchmarks/binary-size.test.ts`

- **ACTION**: enforce binary-size regression budget in test lane
- **IMPLEMENT**: read `dist/cia` size and assert under phase-defined threshold
- **MIRROR**: benchmark test style from `packages/cli/tests/benchmarks/cli-startup.test.ts:57-79`
- **GOTCHA**: avoid flaky machine-dependent checks by testing bytes, not filesystem block usage
- **VALIDATE**: `npx vitest --run packages/cli/tests/benchmarks/binary-size.test.ts`
- **FUNCTIONAL**: `make build && npx vitest --run packages/cli/tests/benchmarks/*.test.ts`
- **TEST_PYRAMID**: extends benchmark test layer, no e2e impact

### Task 4: CREATE `Dockerfile`

- **ACTION**: add multi-stage container build for `cia`
- **IMPLEMENT**: builder stage compiles CLI; runtime stage copies only required artifacts and runs as non-root user
- **MIRROR**: `.github/workflows/release.yml:37-48` for Bun build invocation style
- **GOTCHA**: do not bloat runtime image with full source tree and dev dependencies
- **CURRENT**: Bun and Docker docs verified for `--compile` and multi-stage patterns
- **VALIDATE**: `make build && docker build -t ciagent:latest .`
- **FUNCTIONAL**: `docker run --rm ciagent:latest cia --version`
- **TEST_PYRAMID**: No additional unit tests required; functional packaging smoke test is required

### Task 5: CREATE `.dockerignore`

- **ACTION**: exclude heavy/unneeded files from Docker build context
- **IMPLEMENT**: ignore `node_modules`, `coverage`, `.git`, test outputs, local dev artifacts
- **MIRROR**: Bun Docker guide ignore style and existing repo artifact directories
- **GOTCHA**: do not exclude files needed for build (`packages/cli/src/**`, lockfiles, `package.json`)
- **VALIDATE**: `docker build -t ciagent:latest .`
- **FUNCTIONAL**: confirm build context shrinks and build remains successful
- **TEST_PYRAMID**: No additional tests needed

### Task 6: UPDATE `Makefile`

- **ACTION**: add governed Docker packaging validation target(s)
- **IMPLEMENT**: add `validate-docker` and `validate-size` targets, wire optional use into existing validation workflow
- **MIRROR**: `Makefile:47-69` validation target naming/structure
- **GOTCHA**: keep `make ci` stable; Docker validation should not force local failures when Docker is absent unless explicitly invoked
- **VALIDATE**: `make help && make validate-l1`
- **FUNCTIONAL**: `make validate-size && make validate-docker`
- **TEST_PYRAMID**: No extra unit tests; command-level validation sufficient

### Task 7: UPDATE `.github/workflows/release.yml`

- **ACTION**: include Docker packaging verification/release flow aligned with current release job
- **IMPLEMENT**: add deterministic image build + smoke check + binary-size gate for issue #8
- **MIRROR**: existing step naming and sequence in `release.yml:31-58`
- **GOTCHA**: do not break current binary release assets (`cia-linux-*`, `checksums.txt`)
- **VALIDATE**: `make validate-l1 && npx vitest --run`
- **FUNCTIONAL**: local dry-run equivalent command sequence for docker build/run
- **TEST_PYRAMID**: No additional tests; workflow semantics validated by YAML lint + local command parity

### Task 8: UPDATE `README.md`

- **ACTION**: add packaging quick start + GitHub Actions/GitLab CI shell examples
- **IMPLEMENT**: concise snippets for binary and Docker usage, issue #8 size policy, plus links to spec and enterprise setup
- **MIRROR**: README command-block and table patterns (`README.md:7-25`, `README.md:253-274`)
- **GOTCHA**: keep docs aligned with real commands from `Makefile`/`package.json`; no stale flags
- **VALIDATE**: `make validate-l1`
- **FUNCTIONAL**: manually execute at least one documented local command and one Docker command
- **TEST_PYRAMID**: No extra tests; docs-command verification required

### Task 9: CREATE `docs/enterprise-network-setup.md`

- **ACTION**: add enterprise deployment guide for proxies/certs
- **IMPLEMENT**: include `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`, troubleshooting patterns
- **MIRROR**: behavior expectations in `packages/cli/tests/integration/enterprise-network.test.ts:53-113`
- **GOTCHA**: avoid reintroducing deprecated env-variable guidance unrelated to network infrastructure
- **VALIDATE**: `make validate-l1 && npx vitest --run packages/cli/tests/integration/enterprise-network.test.ts`
- **FUNCTIONAL**: `RUN_INTEGRATION_TESTS=1 bun test packages/cli/tests/integration/enterprise-network.test.ts`
- **TEST_PYRAMID**: Reuse existing integration coverage; add no redundant tests unless new behavior is introduced

### Task 10: UPDATE `docs/cia-cli-spec.md`

- **ACTION**: ensure API docs remain the canonical source for config schema, flags, and exit codes
- **IMPLEMENT**: tighten cross-links and synchronize any outdated statements discovered during Phase 11 edits
- **MIRROR**: existing structured section/table style in `docs/cia-cli-spec.md:35-45`, `docs/cia-cli-spec.md:186-198`
- **GOTCHA**: keep compatibility with current CLI behavior; avoid speculative future-state edits
- **VALIDATE**: `make validate-l1`
- **FUNCTIONAL**: verify `cia --help` content maps to documented options
- **TEST_PYRAMID**: No extra tests; functional docs parity check required

### Task 11: CREATE `CHANGELOG.md`

- **ACTION**: bootstrap changelog with current release conventions and Phase 11 entry
- **IMPLEMENT**: include sections for Added/Changed/Fixes and migration/security notes where relevant
- **MIRROR**: project concise docs style and release workflow expectations
- **GOTCHA**: avoid backfilling speculative historical entries without source evidence
- **VALIDATE**: `make validate-l1 && make validate-l3`
- **FUNCTIONAL**: ensure release workflow references changelog where required
- **TEST_PYRAMID**: No additional tests needed

---

## Testing Strategy

### Unit/Integration/E2E Impact

| Layer | Plan |
| --- | --- |
| Unit | no new core logic expected; rely on existing unit suite |
| Integration | reuse enterprise-network integration tests for docs/behavior parity |
| Benchmark | add binary-size regression test + existing startup benchmark checks |
| E2E | run existing e2e lane as final confidence check |

### Edge Cases Checklist

- [ ] Docker not installed locally: Makefile target fails with clear message
- [ ] Docker image runs as non-root user by default
- [ ] README commands match actual CLI entrypoints and flags
- [ ] GitHub Actions and GitLab examples are syntactically valid and copy-pastable
- [ ] Enterprise proxy examples avoid malformed URL formats
- [ ] No stale references to removed/deprecated non-network env vars
- [ ] Binary-size threshold is explicit, measurable, and enforced in automation

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make validate-l1
```

**EXPECT**: lint + type-check succeed.

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make build && ./dist/cia --help && ./dist/cia --version
```

**EXPECT**: binary builds and help/version execute with exit 0.

### Level 3: UNIT_TESTS

```bash
make validate-l2
```

**EXPECT**: existing tests pass under current coverage baseline.

### Level 4: FULL_SUITE

```bash
make validate-l3 && make validate-l4
```

**EXPECT**: full test lane + binary validation pass.

### Level 5: PACKAGE_VALIDATION

```bash
docker build -t ciagent:latest . && docker run --rm ciagent:latest cia --version
```

**EXPECT**: image builds and CLI works in container.

### Level 5.5: ISSUE_8_BINARY_SIZE_VALIDATION

```bash
make build && bash scripts/check-binary-size.sh && npx vitest --run packages/cli/tests/benchmarks/binary-size.test.ts
```

**EXPECT**: binary-size checks pass the configured threshold and prevent regressions.

### Level 6: CURRENT_STANDARDS_VALIDATION

```bash
bun audit
```

**EXPECT**: advisories are known and documented; no untracked critical regression introduced by phase changes.

### Level 7: MANUAL_VALIDATION

1. Follow README packaging quickstart exactly in a clean shell.
2. Copy the GitHub Actions snippet into a sample workflow and run syntax validation.
3. Copy the GitLab snippet into `.gitlab-ci.yml` and run CI lint.
4. Verify enterprise guide env vars map to behavior described in integration test expectations.

---

## Acceptance Criteria

- [ ] `docker build` + `docker run ... cia --version` path exists and works
- [ ] README contains at least 3 actionable shell-script examples including CI context
- [ ] API docs explicitly cover configuration schema, flags, and exit-code references
- [ ] Enterprise setup guide exists and reflects current environment variable behavior
- [ ] `CHANGELOG.md` exists with Phase 11 entry
- [ ] Issue #8 has a verifiable resolution path with automated size gates
- [ ] Binary-size target and measurement command are documented in README
- [ ] Levels 1-4 validation commands pass
- [ ] No deprecated packaging pattern introduced
- [ ] Security recommendations remain current and documented

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 3 (`/oven-sh/bun`, `/docker/docs`, `/websites/github_en_actions`)
**Web Intelligence Sources**: 7 (Docker docs, GitHub docs, Bun executables, Bun Docker guide, GitLab docs, OWASP Docker, GitHub issue API)
**Last Verification**: 2026-02-21T09:02:00Z
**Security Advisories Checked**: 4 (`bun audit` output)
**Deprecated Patterns Avoided**: single-stage Docker image with build toolchain, root runtime user defaults, unverified CI artifact naming

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Docker packaging inflates image or slows startup | MEDIUM | MEDIUM | enforce multi-stage build and verify with benchmark lane |
| Issue #8 target remains unmet after first optimization pass | MEDIUM | HIGH | use profile matrix + measured gates and document next optimization lever in changelog/issue |
| Docs drift from CLI behavior | MEDIUM | HIGH | command-by-command validation against `cia --help` and Make targets |
| Release workflow regressions | LOW | HIGH | preserve current artifact outputs and add docker steps incrementally |
| Known dependency advisories remain | MEDIUM | MEDIUM | track `bun audit` findings and schedule focused dependency update follow-up |

---

## Notes

- Phase 11 should stay implementation-light in core runtime: package and document existing capabilities rather than expanding feature surface.
- `LICENSE` already exists (`MIT License`), so phase work should verify and reference it rather than recreate it.
- No new npm dependency is required for this phase; dependency/version verification was limited to ensuring referenced versions and runtime tags currently exist.
- Issue #8 is treated as a mandatory Phase 11 deliverable, not a side task.

### Current Intelligence Considerations

- `oven/bun:1.3.9`, `oven/bun:1.3.9-slim`, and related tags are currently published and suitable for deterministic image pinning.
- Bun docs continue to recommend `--compile --minify --sourcemap --bytecode` for production executables.
- OWASP Docker guidance reinforces non-root runtime and hardening posture; docs and examples should reflect this by default.
