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
│ 1. Install: `bun install -g ciagent`            │
└─────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ 2. Set credentials:                             │
│    In `.cia/config.json`                        │
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
6. **Config**: JSON configuration:
   - Primary: `.cia/config.json` for provider configurations
   - Secondary: Only selection of configurations via CLI parameters (e.g. --provider or --model)
   - Tertiary: Only state-of-the-art and infrastructural environment variables like HTTP_PROXY, HTTPS_PROXY, NO_PROXY etc.
7. **Testing**: Vitest with mock providers for unit tests; real API integration tests gated behind env vars
8. **Packaging**: Single Bun binary

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
| 3 | Provider reliability | Contract tests, error normalization, retry/backoff | complete  | - | 2 | .claude/PRPs/plans/provider-reliability.plan.md |
| 3.5 | Interface evolution | Extend IAssistantChat to support conversation history arrays | complete | - | 3 | .claude/PRPs/plans/interface-evolution.plan.md |
| 3a | Core infrastructure fixes | Provider config, JSON input processing, basic context integration | complete | - | 3.5 | .claude/PRPs/plans/core-infrastructure-fixes.plan.md |
| 3b | Schema enforcement & validation | JSON schema response format, retry logic with schema validation | complete | - | 3a | .claude/PRPs/plans/schema-enforcement-validation.plan.md |
| 3c | Template support & output validation | Basic variable substitution, output format validation | pending | - | 3b | - |
| 4 | Azure OpenAI integration | Initial @ai-sdk/azure integration (Vercel AI SDK) | pending | - | 3c | - |
| 5 | Context handling | File/folder reading, GitHub API URL fetching | pending | - | 3c, 4 | - |
| 6 | Model listing | `cia models` command across all providers | pending | with 7 | 3c, 4 | - |
| 7 | MCP/Skills/Tools | Optional integrations for extended capabilities | pending | - | 5, 6, 7 | - |
| 8 | Enterprise network support | HTTP proxy and custom CA bundle support | pending | with 6 | 3c, 4 | - |
| 9 | Streaming output (v2+) | Stdout writer for AsyncGenerator chunks | pending | with 8 | 3c, 4 | - |
| 10 | Testing & benchmarks | Vitest suite, Pi 3/Bun performance benchmarks | pending | - | 9 | - |
| 11 | Packaging & docs | Bun binary, Docker image, README with examples | pending | - | 10 | - |
| 12 | Legacy cleanup | Remove deprecated environment variable support | pending | - | 11 | - |

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

**Phase 3.5: Interface Evolution**
- **Goal**: Extend IAssistantChat interface to support conversation history arrays for JSON input compliance
- **Scope**:
  - **Interface Extension**: Update `IAssistantChat` interface in `packages/cli/src/providers/types.ts`
    - Add overload signature to accept `Message[]` arrays instead of just `string` prompts
    - Maintain backward compatibility with existing string-based calls during transition
    - Define standard `Message` type: `{role: 'system'|'user'|'assistant', content: string}`
  - **Provider Implementation Updates**: Update all existing provider implementations
    - Update `packages/cli/src/providers/codex.ts` to handle both string and Message[] inputs
    - Update `packages/cli/src/providers/claude.ts` to handle both string and Message[] inputs  
    - Convert single string prompts to Message array format internally
    - Ensure conversation history is properly passed to underlying provider SDKs
  - **Backward Compatibility**: Support both interface signatures during transition
    - Overload `sendQuery()` to accept either `string` or `Message[]` 
    - Convert string prompts to single-message arrays internally
    - Maintain existing behavior for string-based calls
  - **Contract Test Updates**: Update provider contract tests to validate both interface signatures
    - Test single string prompt handling (backward compatibility)
    - Test Message[] array handling (new functionality)
    - Ensure consistent behavior across all providers
- **Success signal**: All providers support both `sendQuery("prompt", cwd)` and `sendQuery([{role: "user", content: "prompt"}], cwd)` signatures; contract tests pass for both interface styles

**Phase 3a: Core Infrastructure Fixes**
- **Goal**: Fix fundamental CLI processing issues that block all other functionality
- **Scope**:
  - **Structured Configuration System**: Implement OpenCode-style configuration schema as defined in `docs/cia-cli-spec.md`
    - Support `.cia/config.json` with providers, models, and MCP configurations
    - Implement environment variable substitution (`{env:VAR_NAME}`)
    - Maintain CLI flag override behavior for common options (`--provider`, `--model`, `--timeout`)
    - Remove individual CLI flags like `--endpoint`, `--api-key` in favor of structured config
    - **Temporary**: Maintain legacy environment variable support during transition (to be removed in Phase 11)
  - **Provider Configuration Loading**: Pass structured config to provider create() methods
    - Load provider-specific options (baseURL, apiKey, headers, etc.) from config
    - Support multiple providers with different configurations
    - Enable model-specific options and limits
  - **JSON Input Processing**: Parse `--input-file` JSON conversation format `{"messages": [...], "context": {...}}` instead of plain text
    - Support conversation history format from CLI spec examples (lines 281-293)
    - Distinguish between plain text and JSON conversation inputs
    - Use updated `IAssistantChat` interface with Message[] arrays (from Phase 3.5)
  - **Basic Context Integration**: Use `--context` files in LLM requests (basic _referencing_ only)
    - Reference context files or URLs in JSON context section (no reading or fetching - the agent does that if needed!)
  - **Timeout Implementation**: Add actual timeout mechanism with proper cancellation
- **Success signal**: `cia run --provider azure --model gpt-5.2 --input-file conversation.json --context file.txt "test"` works with provider configs loaded from `.cia/config.json`; JSON conversations parsed correctly

**Phase 3b: Schema Enforcement & Validation** 
- **Goal**: Implement the complex schema enforcement that makes `--mode=strict` actually enforce schemas
- **Scope**:
  - **JSON Schema Response Format**: Implement `response_format: {"type": "json_schema", "json_schema": {...}}` in provider calls
    - Reference implementation approach from `dev/ai-first-devops-toolkit` (pydantic-based validation and retry loop)
    - Use format templates from `dev/ai-first-devops-toolkit/examples/*/schema.json` as test cases
    - Examples: sentiment analysis schema (`examples/01-basic/sentiment-analysis/schema.json`), PR description schema (`examples/02-devops/pr-description/schema.json`)
  - **Schema Validation Retry Logic**: When LLM output doesn't match schema, retry with correction prompts
    - Reference resilient execution patterns from `dev/ai-first-devops-toolkit/llm_ci_runner/retry.py`
  - **Exponential Backoff**: Implement proper exponential backoff for `--retry-backoff` option
  - **Schema Error Handling**: Return proper exit code 2 for schema validation failures
- **Success signal**: `cia run --mode strict --schema-inline '{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}' "Generate JSON"` enforces schema and retries on invalid output

**Phase 3c: Template Support & Output Validation**
- **Goal**: Add basic templating capabilities and polish output formats
- **Scope**:
  - **Basic Template Support**: Simple variable substitution in plain text template files
    - Support `--template-file` with any plain text format (.txt, .md, .tpl, .template, etc.)
    - Variable substitution using `{{variable}}` syntax (e.g., "Analyze {{code}} for {{purpose}}")
    - Support `--template-vars` JSON string or `--template-vars-file` for variable values
    - Template files are simple text with no complex parsing - just string replacement
  - **Output Validation**: Ensure all output formats (json|md|text) produce valid, well-formatted results
    - Remove YAML serialization support (not needed for current use cases)
  - **Out of scope**: Advanced templating features (deferred to later phases)
    - No control sequences (if/else, loops, conditionals)
    - No Jinja2/Handlebars template engines
    - No template inheritance or includes
    - Just simple `{{variable}}` → `value` string replacement
- **Success signal**: `cia run --template-file review.txt --template-vars '{"code":"function foo(){}","purpose":"security"}' works with simple variable substitution

**Phase 4: Azure OpenAI Integration**
- **Goal**: Initial @ai-sdk/azure integration via Vercel AI SDK
- **Scope**:
  - Install `ai` + `@ai-sdk/azure`
  - Create an IAssistantChat to Vercel adapter for integrating any Vercel SDK provider
  - Realize first concrete @ai-sdk/azure provider behind adapter
  - Auth from `AZURE_OPENAI_KEY` + `AZURE_RESOURCE_NAME`
  - Convert non-streaming response to `MessageChunk` AsyncGenerator
  - Add provider contract tests for Azure (reuse Phase 3 harness)
- **Success signal**: `cia run --provider azure --model gpt-5.2 "Hello"` could return response from Azure OpenAI (if authenticated)

**Phase 5: Context Handling**
- **Goal**: `--context` flag references files, folders, URLs without loading content
- **Scope**:
  - File: Reference file path with metadata (size, modified date) but don't read content
  - Folder: Reference folder path with file listing but don't read file contents
  - URL: Reference GitHub PR/issue URL with metadata but don't fetch content
  - Context passed to `IAssistantChat` as structured references in conversation history:
    ```json
    {
      "messages": [
        {
          "role": "system",
          "content": "..."
        },
        {
          "role": "user", 
          "content": "..."
        }
      ],
      "context": {
        "files": [{"path": "README.md", "type": "file", "size": 1234}],
        "urls": [{"url": "https://github.com/org/repo/pull/1", "type": "github_pr"}]
      }
    }
    ```
- **Success signal**: `cia run --context README.md --context https://github.com/org/repo/pull/1 "Summarize"` passes file + PR references in context without loading content

**Phase 6: Model Listing**
- **Goal**: `cia models` shows available models across providers
- **Scope**:
  - Codex: List from SDK or hardcoded (`codex-v1`)
  - Azure: Query Azure API for deployments or env var list
  - Output format: `provider:model` (e.g., `codex:codex-v1`, `azure:gpt-4o`)
- **Success signal**: `cia models` prints table with at least 2 models

**Phase 7: MCP/Skills/Tools**
- **Goal**: Extend capabilities without hardcoding features
- **Scope**:
  - codex SDK and claude SDK and their IAssistantChat compliant implementation should already support MCPs and skills -> they should provide the template for it
  - MCP: Load MCP servers from `~/.cia/mcp.json` or `.cia/mcp.json`
  - Skills: Load skill definitions from `~/.cia/skills/` or `.cia/skills/` (reusable prompt patterns)
  - Tools: Function calling support via provider SDKs
  - All optional, lazy-loaded
- **Success signal**: `cia run --provider codex --model gpt-5.2 "Which skills do you have"` returns predefined skills + `cia run --provider codex --model gpt-5.2 "What is the weather in New York"` returns weather report based on bash/curl calls

**Phase 8: Enterprise Network Support**
- **Goal**: Enable CIA to work in enterprise environments with corporate proxies and custom certificates
- **Scope**:
  - **HTTP Proxy Support**: Implement standard proxy environment variable support
    - Support `HTTP_PROXY`, `HTTPS_PROXY` for outbound HTTP requests
    - Support `NO_PROXY` for bypassing proxy for specific hosts/domains
    - Ensure all provider SDK HTTP calls respect proxy configuration
    - Test proxy support with authenticated and unauthenticated proxies
  - **Custom CA Bundle Support**: Enable custom certificate validation
    - Support `NODE_EXTRA_CA_CERTS` environment variable for additional CA certificates
    - Handle self-signed certificates and internal CAs commonly used in enterprises
    - Ensure certificate validation works across all provider SDKs (Codex, Azure, OpenAI, Claude)
  - **Network Diagnostics**: Add debugging capabilities for network issues
    - Verbose logging for proxy and certificate configuration
    - Clear error messages for certificate validation failures
    - Connection testing utilities for troubleshooting corporate network issues
- **Success signal**: CIA works through corporate HTTP proxy with custom CA certificates; `cia run --log-level DEBUG` shows proxy usage; certificate errors provide clear guidance

**Phase 9: Streaming Output (v2+)**
- **Goal**: Real-time stdout updates as LLM responds (v2+ capability gate)
- **Scope**:
  - Consume `AsyncGenerator<MessageChunk>` from clients
  - Write `assistant` chunks to stdout immediately
  - Optionally show `thinking` chunks with `--verbose`
  - Suppress `tool`, `system` unless `--debug`
- **Success signal**: v2+ only: `cia run "Count to 10"` prints numbers as they arrive, not buffered

**Phase 10: Testing & Benchmarks**
- **Goal**: Confidence in correctness and performance
- **Scope**:
  - Vitest unit tests for all modules (80%+ coverage)
  - Mock providers for fast tests
  - Real API integration tests (gated behind `RUN_INTEGRATION_TESTS=1`)
  - Benchmark suite: measure startup time on Bun vs Node, Pi 3 vs x86
  - Target: <100ms overhead, <50MB memory
  - **Enterprise Network Testing**: Test proxy and CA bundle functionality in realistic enterprise environments
- **Testing strategy**: Reinforce the global test pyramid targets (70% unit, 20% integration, 10% end-to-end) and cover critical CLI flows end-to-end. Use Codex SDK as the primary end-to-end test provider (auth via `~/.codex/auth.json`).
- **Success signal**: All tests pass; benchmark shows <100ms on Pi 3 emulator; proxy tests pass in simulated corporate environment

**Phase 11: Packaging & Docs**
- **Goal**: Distributable artifact and onboarding docs
- **Scope**:
  - Bun binary: `bun build --compile`
  - Docker image: Multi-stage build with slim Bun base (<50MB)
  - README: Quick start, examples (shell scripts for GitHub Actions, GitLab CI)
  - API docs: Configuration schema, flags, exit codes
  - **Enterprise Setup Guide**: Documentation for corporate proxy and certificate configuration
  - LICENSE + CHANGELOG
- **Success signal**: `docker run ciagent:latest cia --version` works; README has 3+ shell script examples; enterprise setup guide covers common proxy scenarios

**Phase 12: Legacy Cleanup**
- **Goal**: Remove deprecated environment variable support to keep CLI explicit
- **Scope**:
  - **Remove Legacy Environment Variables**: Eliminate support for implicit environment variable configuration
    - Remove `CIA_*` environment variables (`CIA_PROVIDER`, `CIA_MODEL`, `CIA_TIMEOUT`, etc.)
    - Remove provider-specific environment variables (`AZURE_OPENAI_*`, `OPENAI_*`, `ANTHROPIC_*`)
    - Keep only explicit configuration paths: CLI flags and `.cia/config.json`
    - Maintain `{env:VAR_NAME}` substitution within config files (explicit environment references)
    - **Preserve Infrastructure Environment Variables**: Keep standard network environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`)
  - **Update Documentation**: Remove all references to legacy environment variables from help text and docs
  - **Migration Guide**: Create migration documentation showing how to convert environment variable setups to config files
  - **Breaking Change Communication**: Clearly document this as a breaking change in CHANGELOG
- **Success signal**: CLI rejects legacy environment variables with helpful error message directing users to use config files; all tests pass without environment variable dependencies; infrastructure environment variables still work

### Parallelism Notes

**Phases 3.5 & 4 (Interface Evolution + Azure)** can run in parallel after Phase 3 is complete. Phase 3.5 evolves the provider interface while Phase 4 implements Azure OpenAI integration. Use separate Git branches or worktrees to avoid conflicts. Integration happens in Phase 3a when both interface updates and Azure provider are merged.

**Phases 6, 7, & 8 (Models + MCP + Enterprise Network)** can run in parallel as they consume provider interfaces without modifying them. All depend on Phases 3c & 4 being complete.

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
