# ciagent: Vendor-Neutral AI Agent CLI for CI/CD

## Problem Statement

DevOps engineers and solo developers need to integrate AI agents into CI/CD pipelines but are blocked by enterprise restrictions on platform agents (GitHub Copilot, etc.) or the rigidity of available solutions. Platform agents lack the flexibility for custom prompting and take months to adopt latest AI capabilities. The cost of not solving this: teams manually perform repetitive code reviews, documentation generation, and analysis tasks that could be automated, or they wait 6-12 months for platform agents to support their enterprise policies.

## Evidence

- **Market validation**: Competitors like `llm-cli`, `llm-ci-runner`, and `promptfoo` exist, proving demand for vendor-neutral CLI tools for LLM integration in CI/CD
- **Technical proof**: POC in `dev/poc-codex-extraction/` demonstrates working provider abstraction with Codex + Claude, proving feasibility
- **User segment**: DevOps engineers managing GitHub Actions workflows and one-man-show developers building automation without enterprise platform access
- **Assumption**: 100ms latency overhead requirement needs validation through benchmark testing on Raspberry Pi 3 / slim Bun containers

## Proposed Solution

A stateless CLI tool (`cia`) that runs in slim Bun containers with <50ms startup time, providing a unified interface to multiple LLM providers (Codex SDK, Claude SDK, Vercel AI SDK with Azure OpenAI). It accepts context from files, folders, and URLs (GitHub PRs, issues), returns responses, and integrates into shell scripts with zero boilerplate. Built on the existing POC's provider abstraction pattern, it prioritizes simplicity over features.

**Why this approach**: Bun's <50ms startup + stateless design keeps overhead under 100ms (vs platform agents with 500ms+ initialization). Provider abstraction prevents vendor lock-in. Shell script integration (not TypeScript) makes it approachable for DevOps workflows.

**Related spec**: `docs/cia-cli-spec.md` (extended structured runner details: strict mode, schema enforcement, output envelopes).

## Key Hypothesis

We believe **a stateless CLI with <100ms overhead and multi-provider support** will **solve enterprise platform agent restrictions and inflexibility** for **DevOps engineers and solo developers**.

We'll know we're right when **ciagent is integrated into 5+ public GitHub workflows within 3 months of release** and **CLI call time averages <150ms (excluding network)** in benchmarks.

## What We're NOT Building

- **Interactive chat or TUI** - Stateless CLI only; users pipe prompts, get responses, done
- **Long-running agents** - No session persistence beyond a single response
- **Proprietary model hosting** - Only integrates existing LLM providers via their SDKs
- **Web UI or dashboard** - Terminal output only; users compose workflows in shell scripts
- **Built-in prompt library** - Users bring their own prompts; we execute them

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| CLI overhead on Pi 3/Bun | <100ms | Benchmark startup + parse time (exclude network) |
| GitHub workflow integrations | 5+ public repos | GitHub code search for `cia run` in workflows |
| Provider switching time | <5min | Time to change from Codex to Azure OpenAI in script |
| Container image size | <50MB | Slim Bun image final compressed size |

## Open Questions

- [ ] Can Vercel AI SDK + Codex SDK coexist without dependency conflicts?
- [ ] What's the actual overhead of MCP/tool/skill integrations on constrained devices?
- [ ] How to handle GitHub API rate limits for URL context fetching?
- [ ] Should we support tool calling in v1, or defer to v2?

---

## Users & Context

**Primary User**
- **Who**: DevOps engineers at enterprises with restricted platform agent policies, or solo developers building CI/CD automation without GitHub Copilot access
- **Current behavior**: Manually write GitHub Actions steps for code analysis, use `curl` + `jq` to pipe data to OpenAI API, or skip AI integration entirely due to complexity
- **Trigger**: Need to automate repetitive tasks (code review, PR summarization, vulnerability scanning) in CI/CD but can't use platform agents
- **Success state**: Single shell command in GitHub workflow that takes PR context and returns AI analysis to output

**Job to Be Done**
When **I'm building a CI/CD pipeline that needs AI reasoning**, I want to **run prompts against multiple LLM providers without vendor lock-in or boilerplate**, so I can **automate decisions without waiting for enterprise platform agent approval**.

**Non-Users**
- **Enterprises with approved platform agents** - If GitHub Copilot works for you, use it; we're not competing with integrated experiences
- **Developers wanting interactive chat** - Use ChatGPT, Claude.ai, or Cursor; this is for automation, not conversation
- **Teams needing guardrails/governance** - We're a CLI tool, not a compliance framework; bring your own policies

---

## Solution Detail

### Core Capabilities (MoSCoW)

First-class providers for v1: Codex SDK, Claude SDK, Vercel AI SDK (Azure, OpenAI, GitHub Copilot).

| Priority | Capability | Rationale |
|----------|------------|-----------|
| Must | Codex SDK integration | POC already works; core provider for testing |
| Must | Claude SDK integration | Native Claude API support |
| Must | Vercel AI SDK integration (Azure, OpenAI, GitHub Copilot) | Enterprise-friendly, modern API |
| Must | Context from files (`--context file.py`) | Essential for code analysis use cases |
| Must | Context from folders (`--context src/`) | Batch file context for large codebases |
| Must | Context from URLs (`--context https://github.com/...`) | GitHub PR/issue integration differentiator |
| Must | Prompt piping (`echo "..." \| cia run`) | Stateless, composable with shell scripts |
| Must | Lazy and strict mode according to `docs/cia-cli-spec.md` | Quick prompting and strictly formatted outputs |
| Must | Model listing (`cia models`) | Discoverability across providers |
| Should | Streaming output | Memory efficiency + real-time feedback |
| Should | MCP (Model Context Protocol) support | Extends capabilities without custom code |
| Should | Skills integration | Reusable prompt patterns for common tasks |
| Should | Tool calling/function execution | Unlock agentic workflows |
| Could | Custom system prompts | Defer until user feedback shows need |
| Won't | Session persistence | Explicitly stateless; no conversation history |

### MVP Scope

**Absolute minimum to validate hypothesis:**

1. **Install & Run**:
   ```bash
   bun install -g ciagent
   echo "Analyze this code" | cia run
   ```

2. **Provider Selection**:
   ```bash
   cia run --provider codex --model gpt-5.2 "..."
   cia run --provider claude --model claude-4-sonnet "..."
   cia run --provider anthropic --model claude-4.5-sonnet "..."
   cia run --provider azure --model gpt-5.2 "..."
   cia run --provider openai --model gpt-5.2 "..."
   cia run --provider github-copilot --model claude-sonnet-4 "..."
   ```

3. **GitHub PR Context**:
   ```bash
   cia run --context https://github.com/org/repo/pull/123 "Summarize changes"
   ```

4. **Model Discovery**:
   ```bash
   cia models  # Lists: codex/codex-v1, claude/claude-3-sonnet, azure/gpt-5.2, github-copilot/claude-sonnet-4, openai/gpt-5.2, etc.
   ```

**Success signal**: DevOps engineer copies one of above commands into GitHub workflow, it runs in <150ms overhead and returns results.

### User Flow

**Critical path - shortest journey to value:**

```
┌─────────────────────────────────────────────────┐
│ 1. Install: `bun install -g ciagent`           │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ 2. Set credentials:                             │
│    export CODEX_API_KEY=xxx                     │
│    export AZURE_OPENAI_KEY=xxx                  │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ 3. Run in workflow:                             │
│    echo "Review this PR" | cia run \            │
│      --context $GITHUB_PR_URL                   │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ 4. Write results to stdout                      │
│    → Pipe to comment, exit code, artifact       │
└─────────────────────────────────────────────────┘
```

**Time to value**: <5 minutes from discovery to working GitHub Action.

---

## Technical Approach

**Feasibility**: **HIGH**

**Architecture Notes**

1. **Runtime**: Bun (not Node.js) for <50ms cold start on Raspberry Pi 3
2. **CLI Framework**: Commander.js (minimal overhead, <5ms initialization)
3. **Provider Abstraction**: Extend POC's `IAssistantClient` interface:
   ```typescript
   interface IAssistantClient {
     sendQuery(prompt: string, context: Context[], options?: Options): AsyncGenerator<MessageChunk>
     listModels(): Promise<Model[]>
   }
   ```
4. **Context Handling**:
   - Files: `fs.readFileSync()` with lazy loading
   - Folders: Recursive walk with `.gitignore` respect
   - URLs: GitHub API fetch (with caching for rate limits)
5. **Streaming**: AsyncGenerator pattern from POC, write chunks to stdout
   - v1 rule: keep the `IAssistantClient` streaming interface everywhere.
   - If a provider SDK exposes streaming, use it.
   - If a provider SDK does not expose streaming, wrap the single response into the AsyncGenerator (no alternate non-streaming interface).
6. **Config**: Environment variables with optional JSON configuration:
   - Primary: `CODEX_API_KEY`, `CLAUDE_API_KEY`, `AZURE_OPENAI_KEY`, `AZURE_RESOURCE_NAME`, `OPENAI_API_KEY`, `GITHUB_TOKEN`
   - Optional: `.cia/config.json` for advanced provider configurations
7. **Testing**: Vitest with mock providers for unit tests; real API integration tests gated behind env vars
8. **Packaging**: Single Bun binary + slim Docker image (<50MB)

**Technical Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Vercel + Codex SDK conflict | LOW | Use peer dependencies; test in CI |
| 100ms overhead impossible | MEDIUM | Bun + lazy loading + pre-compilation should hit target; benchmark early |
| GitHub API rate limits | HIGH | Cache responses; document personal access token setup |
| MCP/Skills overhead on Pi 3 | MEDIUM | Make optional; lazy-load implementations |
| URL context parsing complexity | MEDIUM | Start with GitHub API only; defer GitLab/Bitbucket |

**Testing strategy (all phases)**: Maintain a modern test pyramid with approximate distribution of 70% unit, 20% integration, 10% end-to-end tests. Every phase should add or refine tests in its layer to keep the distribution balanced. Prefer Codex SDK as the end-to-end test provider because auth is available via `~/.codex/auth.json`.
We purster a test coverage of >=40% in early stages of the project.

---

## Implementation Phases

<!--
  STATUS: pending | in-progress | complete
  PARALLEL: phases that can run concurrently (e.g., "with 3" or "-")
  DEPENDS: phases that must complete first (e.g., "1, 2" or "-")
  PRP: link to generated plan file once created
-->

| # | Phase | Description | Status | Parallel | Depends | PRP Plan |
|---|-------|-------------|--------|----------|---------|----------|
| 1 | Core CLI scaffold | Bun setup, Commander.js, arg parsing, env config | complete | - | - | .claude/PRPs/plans/core-cli-scaffold.plan.md |
| 2 | Provider abstraction | Port `IAssistantClient` from POC, factory pattern | complete | - | 1 | - |
| 3 | Provider reliability | Contract tests, error normalization, retry/backoff | pending | - | 2 | - |
| 4 | Azure OpenAI integration | Initial @ai-sdk/azure integration (Vercel AI SDK) | pending | - | 3 | - |
| 5 | Context handling | File/folder reading, GitHub API URL fetching | pending | - | 3, 4 | - |
| 6 | Model listing | `cia models` command across all providers | pending | with 7 | 3, 4 | - |
| 7 | Streaming output (v2+) | Stdout writer for AsyncGenerator chunks | pending | with 6 | 3, 4 | - |
| 8 | MCP/Skills/Tools | Optional integrations for extended capabilities | pending | - | 5, 6, 7 | - |
| 9 | Testing & benchmarks | Vitest suite, Pi 3/Bun performance benchmarks | pending | - | 8 | - |
| 10 | Packaging & docs | Bun binary, Docker image, README with examples | pending | - | 9 | - |

### Phase Details

**Phase 1: Core CLI Scaffold**
- **Goal**: Runnable `cia` command with help text and version
- **Scope**: 
  - Bun project setup with TypeScript
  - Template-grade project scaffolding (Makefile + CI workflow)
  - Makefile is mandatory
  - Pre-push hook is mandatory and runs `make ci`
  - Create the first basic `README.md`
  - Vitest setup with coverage gate (>=40%)
  - Commander.js for `run`, `models` commands (see details: `docs/cia-cli-spec.md`)
  - Environment variable parsing (API keys)
  - Mode + format parsing (`--mode` lazy/strict, `--format` default/json) with strict+schema validation
  - Exit codes (0 = success, 1 = error)
- **Success signal**: `cia --help` and `cia --version` work; `cia run "test"` fails gracefully with "No provider configured"

**Phase 2: Provider Abstraction**
- **Goal**: Common interface for all LLM providers
- **Scope**:
  - Copy `IAssistantClient` interface from POC (`dev/poc-codex-extraction/types.ts`)
  - Rename `.archon` → `.cia` in config paths
  - Factory: `getClient(provider: string): IAssistantClient`
  - Message types: `MessageChunk` with `assistant`, `tool`, `thinking`, `system`
- **Success signal**: Mock client passes interface contract in Vitest tests

**Phase 3: Provider Reliability**
- **Goal**: Harden provider behavior now that Codex + Claude share `IAssistantChat`
- **Scope**:
  - Shared chat chunk contract tests for all providers (assistant/system/tool/error/result)
  - Normalize provider errors into consistent CLI errors and exit codes
  - Retry + backoff wiring for provider calls (respect `--retries`, `--retry-backoff`, `--timeout`)
  - Ensure missing auth/config fails fast with actionable messages
- **Success signal**: Contract tests pass; retries and timeouts behave consistently across codex/claude

**Phase 4: Azure OpenAI Integration**
- **Goal**: Initial @ai-sdk/azure integration via Vercel AI SDK
- **Scope**:
  - Install `ai` + `@ai-sdk/azure`
  - Implement `AzureClient` using `generateText()` from Vercel SDK
  - Auth from `AZURE_OPENAI_KEY` + `AZURE_RESOURCE_NAME`
  - Convert non-streaming response to `MessageChunk` AsyncGenerator
  - Add provider contract tests for Azure (reuse Phase 3 harness)
- **Success signal**: `CIA_PROVIDER=azure cia run "Hello"` returns response from Azure OpenAI

**Phase 5: Context Handling**
- **Goal**: `--context` flag loads files, folders, URLs
- **Scope**:
  - File: `fs.readFileSync()` with encoding detection
  - Folder: Recursive walk respecting `.gitignore`, aggregate files
  - URL: GitHub API fetch for PRs (`/pulls/:number/files`), issues (`/issues/:number`)
  - Context passed to `sendQuery()` as structured array
- **Success signal**: `cia run --context README.md --context https://github.com/org/repo/pull/1 "Summarize"` includes file + PR diff in prompt

**Phase 6: Model Listing**
- **Goal**: `cia models` shows available models across providers
- **Scope**:
  - Codex: List from SDK or hardcoded (`codex-v1`)
  - Azure: Query Azure API for deployments or env var list
  - Output format: `provider:model` (e.g., `codex:codex-v1`, `azure:gpt-4o`)
- **Success signal**: `cia models` prints table with at least 2 models

**Phase 7: Streaming Output (v2+)**
- **Goal**: Real-time stdout updates as LLM responds (v2+ capability gate)
- **Scope**:
  - Consume `AsyncGenerator<MessageChunk>` from clients
  - Write `assistant` chunks to stdout immediately
  - Optionally show `thinking` chunks with `--verbose`
  - Suppress `tool`, `system` unless `--debug`
- **Success signal**: v2+ only: `cia run "Count to 10"` prints numbers as they arrive, not buffered

**Phase 8: MCP/Skills/Tools**
- **Goal**: Extend capabilities without hardcoding features
- **Scope**:
  - MCP: Load MCP servers from env var or `.cia/mcp.json`
  - Skills: Load skill definitions from `.cia/skills/` (reusable prompt patterns)
  - Tools: Function calling support via provider SDKs
  - All optional, lazy-loaded
- **Success signal**: `cia run --skill code-review "Review PR"` uses predefined skill pattern

**Phase 9: Testing & Benchmarks**
- **Goal**: Confidence in correctness and performance
- **Scope**:
  - Vitest unit tests for all modules (80%+ coverage)
  - Mock providers for fast tests
  - Real API integration tests (gated behind `RUN_INTEGRATION_TESTS=1`)
  - Benchmark suite: measure startup time on Bun vs Node, Pi 3 vs x86
  - Target: <100ms overhead, <50MB memory
- **Testing strategy**: Reinforce the global test pyramid targets (70% unit, 20% integration, 10% end-to-end) and cover critical CLI flows end-to-end. Use Codex SDK as the primary end-to-end test provider (auth via `~/.codex/auth.json`).
- **Success signal**: All tests pass; benchmark shows <100ms on Pi 3 emulator

**Phase 10: Packaging & Docs**
- **Goal**: Distributable artifact and onboarding docs
- **Scope**:
  - Bun binary: `bun build --compile`
  - Docker image: Multi-stage build with slim Bun base (<50MB)
  - README: Quick start, examples (shell scripts for GitHub Actions, GitLab CI)
  - API docs: Environment variables, flags, exit codes
  - LICENSE + CHANGELOG
- **Success signal**: `docker run ciagent:latest cia --version` works; README has 3+ shell script examples

### Parallelism Notes

**Phases 3 & 4 (Codex + Azure)** can run in parallel as they implement the same interface independently. Use separate Git branches or worktrees to avoid conflicts. Integration happens in Phase 5 when both are merged.

**Phases 6 & 7 (Models + Streaming)** can run in parallel as they consume provider interfaces without modifying them. Both depend on Phases 3 & 4 being complete.

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Runtime | Bun | Node.js, Deno | <50ms startup on Pi 3; native TS; built-in bundler |
| CLI Framework | Commander.js / yargs | oclif, Gluegun | Minimal overhead (<5ms); zero opinions; battle-tested |
| Config | Env vars only | YAML/JSON files | Stateless principle; CI/CD native; no file I/O overhead |
| Provider abstraction | Extend POC's `IAssistantClient` | Build from scratch | 6-month head start; proven pattern; AsyncGenerator works |
| Testing | Vitest | Jest, ava | Fast, Bun-compatible, modern API |
| Packaging | Bun binary + Docker | npm package only | Binary = zero install; Docker = reproducible CI/CD |
| Streaming | AsyncGenerator | EventEmitter, callbacks | POC pattern; type-safe; backpressure handling |
| Claude SDK | Include in MVP | Defer to v2 | Required first-class provider |

---

## Research Summary

**Market Context**
- **Competitors**: `llm-cli`, `llm-ci-runner`, `promptfoo` prove demand for vendor-neutral LLM CLI tools in CI/CD
- **Gap**: None support URL context (GitHub PRs) as first-class; most focus on single-shot invocations
- **Opportunity**: Streaming + session management + URL context = differentiator
- **Adoption pattern**: DevOps tools succeed when integration is <5 minutes; examples critical

**Technical Context**
- **POC advantages**: Working provider abstraction, CI-proven pattern (`ci-review.ts`)
- **Bun performance**: 30-50ms cold start vs Node's 200-300ms; meets <100ms constraint
- **Vercel AI SDK**: Native Azure OpenAI; `@ai-sdk/azure` is production-ready
- **Raspberry Pi optimization**: Minimize dependencies, lazy-load modules, use fast SD card; Bun eliminates most overhead
- **Risk mitigation**: Benchmark early (Phase 9); if <100ms impossible, adjust to "best effort" and document

---

*Generated: 2026-02-08T16:10:55Z*  
*Status: DRAFT - needs validation*
