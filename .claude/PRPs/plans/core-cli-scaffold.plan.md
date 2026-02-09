# Feature: Core CLI Scaffold for ciagent

## Summary

Create the foundational CLI architecture for ciagent - a vendor-neutral AI agent CLI tool for CI/CD pipelines. This establishes the Bun-based runtime, TypeScript project structure, argument parsing with Node.js `parseArgs` utility, environment configuration, and testing framework. The scaffold provides the base for all subsequent provider integrations and features while targeting <100ms startup overhead.

## User Story

As a DevOps engineer at an enterprise with restricted platform agent policies
I want to install and run a basic `cia` CLI command with help and version
So that I can validate the tool works in my environment before configuring AI providers

## Problem Statement

Phase 1 creates the minimal runnable CLI that can be installed globally and provides proper help/version output with graceful error handling when no providers are configured. Must achieve <50ms startup time on Bun runtime to meet the <100ms total overhead target.

## Solution Statement

Build a TypeScript-based CLI using Bun runtime with Node.js `parseArgs` for argument parsing, following the established patterns from the existing codebase. Structure as a workspace package that can be built into a standalone binary for distribution.

## Metadata

| Field               | Value                                             |
| ------------------- | ------------------------------------------------- |
| Type                | NEW_CAPABILITY                                    |
| Complexity          | HIGH                                              |
| Systems Affected    | CLI runtime, project structure, build system, config hierarchy, validation, test pyramid |
| Dependencies        | bun >=1.0.0, @types/bun, typescript, JSON Schema validator |
| Estimated Tasks     | 13                                                |
| **Research Timestamp** | **2026-02-09T23:00:00Z**                      |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              BEFORE STATE                                    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │   DevOps    │ ──────► │ Manual AI   │ ──────► │ Inconsistent│            ║
║   │ Engineer    │         │ Integration │         │  Results    │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                                                               ║
║   USER_FLOW: curl OpenAI API + jq parsing + shell scripting                  ║
║   PAIN_POINT: No standardized tool, manual API calls, no streaming           ║
║   DATA_FLOW: Raw JSON → manual parsing → shell variables                     ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║                               AFTER STATE                                    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │   DevOps    │ ──────► │ cia --help  │ ──────► │ Clear Usage │            ║
║   │ Engineer    │         │ cia run     │         │ Instructions│            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                   │                                           ║
║                                   ▼                                           ║
║                          ┌─────────────┐                                      ║
║                          │ Structured  │  ◄── Binary distribution ready      ║
║                          │ CLI Tool    │                                      ║
║                          └─────────────┘                                      ║
║                                                                               ║
║   USER_FLOW: bun install -g ciagent → cia --help → configuration guidance    ║
║   VALUE_ADD: Standard tool interface, proper help, version info, errors      ║
║   DATA_FLOW: CLI args → parsed options → structured output                   ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes

| Location        | Before                    | After                     | User_Action   | Impact                |
| --------------- | ------------------------- | ------------------------- | ------------- | --------------------- |
| Terminal        | No cia command exists     | `cia --help` works        | Run --help    | Gets usage guidance   |
| Terminal        | No version info           | `cia --version` works     | Run --version | Gets version info     |
| CI/CD Pipeline  | Manual curl + jq scripts  | `cia run` fails gracefully| Try basic run | Clear error message  |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `dev/remote-coding-agent/packages/cli/src/cli.ts` | 1-281 | Bun CLI pattern to MIRROR exactly |
| P0 | `dev/remote-coding-agent/packages/cli/package.json` | 1-23 | Package structure to COPY |
| P1 | `dev/remote-coding-agent/tsconfig.json` | 1-23 | TypeScript config to MIRROR |
| P1 | `dev/remote-coding-agent/packages/cli/tsconfig.json` | 1-13 | Package-level TS config |
| P2 | `dev/remote-coding-agent/packages/core/src/index.ts` | 1-287 | Barrel exports pattern |
| P2 | `dev/poc-codex-extraction/types.ts` | 1-48 | IAssistantClient interface to PORT |

**Current External Documentation (Verified Live):**

| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [Bun CLI Build](https://github.com/oven-sh/bun/blob/main/docs/bundler/executables.mdx) ✓ Current | Compile to Binary | Binary distribution | 2026-02-09T23:00:00Z |
| [Node.js parseArgs](https://github.com/nodejs/node/blob/main/doc/api/util.md) ✓ Current | util.parseArgs API | Argument parsing | 2026-02-09T23:00:00Z |

---

## Patterns to Mirror

**BRUN_SHEBANG_PATTERN:**
```typescript
// SOURCE: dev/remote-coding-agent/packages/cli/src/cli.ts:1
// COPY THIS PATTERN:
#!/usr/bin/env bun
```

**PARSEARGS_PATTERN:**
```typescript
// SOURCE: dev/remote-coding-agent/packages/cli/src/cli.ts:114-141
// COPY THIS PATTERN WITH CLI SPEC EXTENSIONS:
import { parseArgs } from 'util';

try {
  parsedArgs = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      // CLI SPEC REQUIRED OPTIONS:
      mode: { type: 'string', default: 'lazy' }, // lazy|strict
      format: { type: 'string', default: 'default' }, // default|json
      provider: { type: 'string', short: 'p', default: 'azure' },
      model: { type: 'string', short: 'm' },
      context: { type: 'string', multiple: true },
      'input-file': { type: 'string' },
      'schema-file': { type: 'string' },
      'schema-inline': { type: 'string' },
      'output-file': { type: 'string', default: 'result.json' },
      'output-format': { type: 'string' }, // json|yaml|md|text
      retries: { type: 'string', default: '1' },
      'retry-backoff': { type: 'boolean', default: true },
      timeout: { type: 'string', default: '60' },
      endpoint: { type: 'string' },
      'api-key': { type: 'string' },
      'api-version': { type: 'string' },
      org: { type: 'string' },
      'log-level': { type: 'string', default: 'INFO' },
    },
    allowPositionals: true,
    strict: false,
  });
} catch (error) {
  const err = error as Error;
  console.error(`Error parsing arguments: ${err.message}`);
  printUsage();
  return 1; // Exit code 1: Input validation error per CLI spec
}
```

**ENVIRONMENT_CONFIG_PATTERN:**
```typescript
// SOURCE: dev/remote-coding-agent/packages/cli/src/cli.ts:15-25
// COPY THIS PATTERN:
import { config } from 'dotenv';
import { resolve, existsSync } from 'path';

// Load .env from global CIA config only
const globalEnvPath = resolve(process.env.HOME ?? '~', '.cia', '.env');
if (existsSync(globalEnvPath)) {
  const result = config({ path: globalEnvPath });
  if (result.error) {
    console.error(`Error loading .env from ${globalEnvPath}: ${result.error.message}`);
    process.exit(1);
  }
}
```

**ERROR_HANDLING_PATTERN:**
```typescript
// SOURCE: dev/remote-coding-agent/packages/cli/src/cli.ts:258-268
// COPY THIS PATTERN:
} catch (error) {
  const err = error as Error;
  console.error(`Error: ${err.message}`);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  return 1;
}
```

**PACKAGE_JSON_STRUCTURE:**
```json
// SOURCE: dev/remote-coding-agent/packages/cli/package.json:1-23
// COPY THIS PATTERN:
{
  "name": "@ciagent/cli",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/cli.ts",
  "bin": {
    "cia": "./src/cli.ts"
  },
  "dependencies": {
    "@ciagent/core": "workspace:*",
    "dotenv": "^17.2.3"
  }
}
```

**TYPESCRIPT_CONFIG_PATTERN:**
```json
// SOURCE: dev/remote-coding-agent/tsconfig.json:1-23
// COPY THIS PATTERN:
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["bun-types"]
  }
}
```

**TEST_STRUCTURE:**
```typescript
// SOURCE: dev/remote-coding-agent/packages/cli/src/commands/version.test.ts:1-57
// COPY THIS PATTERN:
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';

describe('CLI', () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should output help text', async () => {
    // Test implementation
  });
});
```

---

## Current Best Practices Validation

**Security (Context7 MCP Verified):**
- ✅ Environment variable handling follows secure patterns
- ✅ No hardcoded secrets or credentials in code
- ✅ Proper error handling without information leakage
- ✅ Binary compilation security practices current

**Performance (Context7 MCP Verified):**
- ✅ Bun runtime provides <50ms startup (confirmed 2026 docs)
- ✅ parseArgs is faster than Commander.js for simple parsing
- ✅ Lazy loading patterns for optional dependencies
- ✅ Memory-efficient argument processing

**Community Intelligence:**
- ✅ Bun CLI patterns align with current community practices
- ✅ parseArgs is the recommended Node.js built-in (stable since v16)
- ✅ TypeScript strict mode configuration follows 2026 standards
- ✅ Monorepo workspace patterns are current standard

---

## Files to Change

| File                             | Action | Justification                            |
| -------------------------------- | ------ | ---------------------------------------- |
| `package.json`                   | CREATE | Root workspace configuration             |
| `tsconfig.json`                  | CREATE | Root TypeScript configuration            |
| `packages/cli/package.json`      | CREATE | CLI package configuration                |
| `packages/cli/tsconfig.json`     | CREATE | CLI TypeScript overrides                |
| `packages/cli/src/cli.ts`        | CREATE | Main CLI entry point with full spec     |
| `packages/cli/src/commands/help.ts` | CREATE | Help command with detailed spec usage |
| `packages/cli/src/commands/version.ts` | CREATE | Version command implementation      |
| `packages/cli/src/config/loader.ts` | CREATE | Config hierarchy: CLI > repo > user > env |
| `packages/cli/src/utils/exit-codes.ts` | CREATE | CLI spec exit codes (0-5)           |
| `packages/cli/src/utils/validation.ts` | CREATE | Input validation for CLI spec        |
| `packages/cli/src/cli.test.ts`   | CREATE | CLI argument parsing tests (UNIT)       |
| `packages/cli/src/integration.test.ts` | CREATE | CLI workflow tests (INTEGRATION)   |
| `packages/cli/src/e2e.test.ts`   | CREATE | End-to-end CLI tests (E2E)              |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **Provider integrations** - Handled in Phase 2+ (provider abstraction required first)
- **Actual LLM execution** - `cia run` will fail gracefully with "No provider configured" error (EXCEPT E2E tests)
- **Context file/URL fetching** - Handled in Phase 5 (needs provider framework)  
- **Schema enforcement logic** - Handled with provider integration phases
- **JSON conversation input parsing** - Basic structure only, full parsing in provider phases
- **MCP/Skills/Tools** - Handled in Phase 8 (advanced features)
- **Docker packaging** - Handled in Phase 10 (packaging phase)
- **OAuth authentication flow** - Basic structure only, implementation in provider phases

**Exception for E2E Testing**: E2E tests WILL include real Codex SDK integration using ~/.codex/auth.json to validate the complete user experience and ensure the CLI architecture supports real provider integration.

---

## Step-by-Step Tasks

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

### Task 1: CREATE `package.json` (root workspace)

- **ACTION**: CREATE root package.json with Bun workspace configuration
- **IMPLEMENT**: Monorepo setup with workspace packages, Bun scripts, CLI dev command
- **MIRROR**: `dev/remote-coding-agent/package.json:1-46` - follow workspace pattern
- **IMPORTS**: None - root configuration file
- **GOTCHA**: Use `"type": "module"` for ESM, `workspaces: ["packages/*"]`
- **CURRENT**: Bun workspace format verified as current in 2026 docs
- **VALIDATE**: `bun --version` - ensure Bun >=1.0.0 available

### Task 2: CREATE `tsconfig.json` (root)

- **ACTION**: CREATE root TypeScript configuration with strict mode
- **IMPLEMENT**: ES2022 target, ESNext modules, strict mode, Bun types
- **MIRROR**: `dev/remote-coding-agent/tsconfig.json:1-23`
- **IMPORTS**: None - configuration file
- **TYPES**: Include `bun-types` for Bun runtime types
- **GOTCHA**: Use `"moduleResolution": "bundler"` for Bun compatibility
- **CURRENT**: TypeScript 5.x configuration patterns verified current
- **VALIDATE**: `bun tsc --noEmit` - types must compile without errors

### Task 3: CREATE `packages/cli/package.json`

- **ACTION**: CREATE CLI package configuration with binary entry
- **IMPLEMENT**: Package name, bin entry, workspace dependencies, test scripts
- **MIRROR**: `dev/remote-coding-agent/packages/cli/package.json:1-23`
- **IMPORTS**: `dotenv` for environment config, JSON Schema validator
- **BINARY**: `"bin": { "cia": "./src/cli.ts" }` for global install
- **GOTCHA**: Use `workspace:*` for internal dependencies
- **CURRENT**: Package.json binary field pattern verified current
- **VALIDATE**: `bun install` - dependencies resolve correctly

### Task 4: CREATE `packages/cli/tsconfig.json`

- **ACTION**: CREATE CLI TypeScript configuration extending root
- **IMPLEMENT**: Package-specific paths, exclude patterns, includes
- **MIRROR**: `dev/remote-coding-agent/packages/cli/tsconfig.json:1-13`
- **EXTENDS**: `"extends": "../../tsconfig.json"`
- **PATHS**: Workspace path mapping when core package exists
- **GOTCHA**: Include test files in development, exclude in build
- **CURRENT**: TSConfig extends pattern verified current
- **VALIDATE**: `bun tsc --noEmit` - CLI package types compile

### Task 5: CREATE `packages/cli/src/utils/exit-codes.ts`

- **ACTION**: CREATE CLI spec exit codes constants
- **IMPLEMENT**: Exit codes 0-5 as specified in docs/cia-cli-spec.md
- **MIRROR**: None - new requirement from CLI spec
- **PATTERN**: Export const enum with descriptive names
- **CODES**: SUCCESS=0, INPUT_VALIDATION=1, SCHEMA_VALIDATION=2, AUTH_CONFIG=3, LLM_EXECUTION=4, TIMEOUT=5
- **CURRENT**: TypeScript const enum pattern is current best practice
- **VALIDATE**: `bun tsc --noEmit` - types compile correctly

### Task 6: CREATE `packages/cli/src/config/loader.ts`

- **ACTION**: CREATE configuration hierarchy loader
- **IMPLEMENT**: CLI flags > repo config > user config > env vars (per CLI spec)
- **MIRROR**: `dev/remote-coding-agent/packages/core/src/config/config-loader.ts:1-347`
- **HIERARCHY**: 1. CLI flags, 2. `.cia/config.json` (repo), 3. `~/.cia/config.json` (user), 4. Environment variables
- **PATTERN**: Merge configs with priority order, validate required fields
- **GOTCHA**: Handle missing config files gracefully, secure env var access
- **VALIDATE**: Config loading works with and without config files

### Task 7: CREATE `packages/cli/src/utils/validation.ts`

- **ACTION**: CREATE input validation utilities
- **IMPLEMENT**: Validate mode (lazy|strict), format (default|json), schema requirements
- **PATTERN**: Pure functions returning validation results with error messages
- **CLI_SPEC**: Mode=strict requires schema-file or schema-inline, exit code 1 for validation errors
- **VALIDATION**: Provider names, model formats, file existence, JSON schema format
- **CURRENT**: Input validation patterns follow current TypeScript practices
- **VALIDATE**: All validation functions work correctly with edge cases

### Task 8: CREATE `packages/cli/src/cli.ts` (FULL CLI SPEC)

- **ACTION**: CREATE main CLI entry point with complete CLI spec implementation
- **IMPLEMENT**: Full parseArgs setup, config hierarchy, validation, error handling per CLI spec
- **MIRROR**: `dev/remote-coding-agent/packages/cli/src/cli.ts:1-281` structure
- **CLI_SPEC**: All flags from docs/cia-cli-spec.md, proper exit codes, mode/format handling
- **PATTERN**: Use config loader, validation utils, proper exit codes
- **RUN_COMMAND**: Accept but fail gracefully with "No provider configured" (exit code 3)
- **CURRENT**: Full CLI spec implementation with current parseArgs patterns
- **VALIDATE**: `bun packages/cli/src/cli.ts --help` and `cia run --mode=strict` validation

### Task 9: CREATE `packages/cli/src/commands/help.ts`

- **ACTION**: CREATE help command with complete CLI spec usage
- **IMPLEMENT**: Full CLI spec documentation, all flags, examples, mode explanations
- **MIRROR**: `dev/remote-coding-agent/packages/cli/src/cli.ts:52-82` - printUsage function
- **CLI_SPEC**: Document all flags from docs/cia-cli-spec.md with examples
- **PATTERN**: Export function that prints to stdout, exit code 0
- **EXAMPLES**: Include mode/format combinations, schema usage, context examples
- **VALIDATE**: `cia --help` displays complete CLI spec documentation

### Task 10: CREATE `packages/cli/src/commands/version.ts`

- **ACTION**: CREATE version command with system information
- **IMPLEMENT**: Package version, Bun version, Node.js compatibility, OS info
- **MIRROR**: `dev/remote-coding-agent/packages/cli/src/commands/version.test.ts:1-57` test pattern
- **PATTERN**: Export async function, use process.versions and Bun.version
- **FORMAT**: `ciagent v0.1.0`, `Bun v1.x.x`, `Platform: linux-x64`
- **CURRENT**: Bun.version API is current and stable
- **VALIDATE**: `cia --version` displays version and system info

### Task 11: CREATE UNIT TESTS (70% of test pyramid)

- **ACTION**: CREATE comprehensive unit tests for CLI components
- **IMPLEMENT**: Test all modules individually with mocks/stubs
- **FILES**: 
  - `packages/cli/src/cli.test.ts` - Main CLI parsing and routing
  - `packages/cli/src/config/loader.test.ts` - Configuration hierarchy
  - `packages/cli/src/utils/validation.test.ts` - Input validation
  - `packages/cli/src/commands/help.test.ts` - Help output
  - `packages/cli/src/commands/version.test.ts` - Version output
- **PATTERN**: Use Bun test with mocks, cover happy path + error cases
- **COVERAGE**: Target >80% line coverage, test all CLI spec requirements
- **VALIDATE**: `bun test` passes, coverage report shows >80%

### Task 12: CREATE INTEGRATION TESTS (20% of test pyramid)

- **ACTION**: CREATE integration tests for CLI workflows
- **IMPLEMENT**: Test component interactions without external dependencies
- **FILE**: `packages/cli/src/integration.test.ts`
- **SCENARIOS**: Config loading + validation + CLI parsing, mode/format combinations, error propagation
- **PATTERN**: Test real file I/O, config hierarchy, cross-module integration
- **NO_EXTERNAL**: Mock any external APIs, focus on internal component integration
- **VALIDATE**: Integration tests pass, realistic workflow scenarios work

### Task 13: CREATE END-TO-END TESTS (10% of test pyramid) 

- **ACTION**: CREATE end-to-end CLI tests with real Codex SDK authentication
- **IMPLEMENT**: Test actual CLI binary execution with real auth from ~/.codex/auth.json
- **FILE**: `packages/cli/src/e2e.test.ts` 
- **SCENARIOS**: 
  - Binary execution with real Codex authentication
  - `cia run "Hello world"` with streaming response
  - Error handling when auth is missing/invalid
  - Global install and execution workflows
- **AUTHENTICATION**: Use real `~/.codex/auth.json` file for authentic integration testing
- **PATTERN**: Spawn actual CLI processes, test stdout/stderr, exit codes with real API calls
- **REAL_INTEGRATION**: Test with Codex SDK, verify streaming works, validate response format
- **GATED**: Run only when `RUN_E2E_TESTS=1` environment variable set (requires valid auth)
- **VALIDATE**: E2E tests pass with real Codex responses, CLI works as user would experience

---

## Testing Strategy (CLI Spec + Test Pyramid Compliant)

### Test Pyramid Distribution (Per PRD Requirements)

**Unit Tests (70%)**:
- CLI argument parsing and validation
- Configuration hierarchy loading  
- Individual command implementations
- Utility functions (validation, exit codes)
- Mocked external dependencies

**Integration Tests (20%)**:
- Config loading + CLI parsing workflows
- Cross-module component interactions
- Mode/format combination scenarios
- Error propagation between layers

**End-to-End Tests (10%)**:
- Actual binary execution with real Codex SDK authentication
- Global installation workflows  
- Real user interaction scenarios with ~/.codex/auth.json
- Complete CLI spec compliance with real API responses
- Streaming validation with actual Codex service

### Unit Tests Coverage

| Test File                                | Test Cases                      | Validates         | Pyramid Layer |
| ---------------------------------------- | ------------------------------- | ----------------- | ------------- |
| `packages/cli/src/cli.test.ts`           | parseArgs, routing, exit codes  | Main CLI logic    | Unit (70%)    |
| `packages/cli/src/config/loader.test.ts` | Config hierarchy, merging       | Configuration     | Unit (70%)    |
| `packages/cli/src/utils/validation.test.ts` | Input validation, schema checks | Validation logic  | Unit (70%)    |
| `packages/cli/src/commands/help.test.ts` | Help output formatting          | Help content      | Unit (70%)    |
| `packages/cli/src/commands/version.test.ts` | Version info accuracy         | Version output    | Unit (70%)    |
| `packages/cli/src/integration.test.ts`   | Component interactions          | Workflow logic    | Integration (20%) |
| `packages/cli/src/e2e.test.ts`           | Binary execution, real Codex authentication | Complete CLI spec + Real API | End-to-End (10%) |

### CLI Spec Compliance Checklist

- ✅ All CLI spec flags implemented in parseArgs
- ✅ Mode (lazy|strict) and format (default|json) handling
- ✅ Configuration hierarchy: CLI > repo > user > env
- ✅ Exit codes 0-5 per specification  
- ✅ Input validation with proper error messages
- ✅ Help displays complete CLI spec documentation
- ✅ Schema file validation structure (implementation deferred)

### Edge Cases Checklist

- ✅ Unknown command arguments  
- ✅ Invalid flag combinations
- ✅ Missing environment permissions
- ✅ Bun runtime not available
- ✅ Workspace dependency resolution
- ✅ Binary execution permissions

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
bun run type-check && bun run lint
```

**EXPECT**: Exit 0, no errors or warnings

### Level 2: UNIT_TESTS

```bash
bun test packages/cli/src/
```

**EXPECT**: All tests pass, coverage >= 80%

### Level 3: FULL_SUITE

```bash
bun test && bun run build
```

**EXPECT**: All tests pass, build succeeds

### Level 4: BINARY_VALIDATION

```bash
bun build --compile --target=bun-linux-x64 --outfile=./dist/cia packages/cli/src/cli.ts
./dist/cia --help
./dist/cia --version
```

**EXPECT**: Binary runs, help/version output correct

### Level 5: INSTALL_VALIDATION

```bash
bun link packages/cli
cia --help
cia --version
```

**EXPECT**: Global install works, commands execute

### Level 6: CURRENT_STANDARDS_VALIDATION

Use Context7 MCP to verify:
- ✅ Bun CLI patterns follow current best practices
- ✅ parseArgs usage aligns with Node.js documentation
- ✅ TypeScript configuration uses current standards
- ✅ Package.json structure follows current conventions

### Level 7: MANUAL_VALIDATION

1. **Help Command**: Run `cia --help` and verify complete usage information
2. **Version Command**: Run `cia --version` and verify version + system info
3. **Error Handling**: Run `cia badcommand` and verify graceful error message
4. **Run Stub**: Run `cia run "test"` and verify "No provider configured" error

---

## Acceptance Criteria

- ✅ All specified functionality implemented per user story
- ✅ Level 1-3 validation commands pass with exit 0
- ✅ Unit tests cover >= 80% of new code
- ✅ Code mirrors existing patterns exactly (naming, structure, error handling)
- ✅ No regressions in existing tests (none exist yet)
- ✅ UX matches "After State" diagram
- ✅ **Implementation follows current best practices**
- ✅ **No deprecated patterns or vulnerable dependencies**
- ✅ **Security recommendations up-to-date**
- ✅ **Startup time <50ms on Bun runtime**

---

## Completion Checklist

- [ ] All tasks completed in dependency order
- [ ] Each task validated immediately after completion
- [ ] Level 1: Static analysis (type-check + lint) passes
- [ ] Level 2: Unit tests pass
- [ ] Level 3: Full test suite + build succeeds
- [ ] Level 4: Binary compilation and execution works
- [ ] Level 5: Global install and CLI commands work
- [ ] Level 6: Current standards validation passes
- [ ] All acceptance criteria met

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 2 (Bun runtime, Node.js parseArgs)
**Web Intelligence Sources**: 0 (Context7 provided sufficient current information)
**Last Verification**: 2026-02-09T23:00:00Z
**Security Advisories Checked**: 1 (Bun binary compilation security)
**Deprecated Patterns Avoided**: Commander.js (parseArgs is built-in and faster)

---

## Risks and Mitigations

| Risk               | Likelihood   | Impact       | Mitigation                              |
| ------------------ | ------------ | ------------ | --------------------------------------- |
| Bun version compatibility | LOW | MEDIUM | Pin to Bun >=1.0.0 in engines field |
| parseArgs Node.js compatibility | LOW | LOW | parseArgs stable since Node 16, Bun compatible |
| Workspace resolution issues | MEDIUM | LOW | Test workspace dependencies in CI |
| Binary permissions on CI/CD | MEDIUM | MEDIUM | Document chmod +x in installation guide |
| Memory usage on Pi 3 | LOW | HIGH | Lazy load modules, benchmark early |

---

## Notes

### Current Intelligence Considerations

**Bun Runtime Evolution (2026)**: Bun 1.x is stable and production-ready. Binary compilation feature is mature with cross-platform support. Startup performance consistently <50ms makes it ideal for CLI tools.

**parseArgs vs Commander.js**: Node.js built-in parseArgs is faster and has zero dependencies. The existing codebase successfully uses this pattern, eliminating the need for Commander.js which was specified in the PRD but is not actually used in the working code.

**Monorepo Strategy**: Following existing patterns with workspace packages enables clean separation between CLI and core packages for future provider integrations.

**Testing Framework**: Bun's built-in test runner is fast and compatible with existing patterns. No need for additional testing dependencies.