# Feature: CIA CLI Enhancement with MCP and Skills Management

## Summary

Enhance the existing CIA CLI with comprehensive MCP server and Skills management commands, providing DevOps engineers with rich discovery capabilities, health monitoring, and status reporting while maintaining the <150ms overhead performance constraint.

## User Story

As a DevOps engineer using CIA agent in CI/CD pipelines
I want to discover and manage available MCP tools and Skills through CLI commands
So that I can understand CIA's capabilities and efficiently configure automation workflows

## Problem Statement

CLI lacks user-friendly commands to manage and discover MCP tools and Skills capabilities. DevOps engineers cannot easily determine what tools are available, their status, or how to troubleshoot connection issues, leading to inefficient configuration and reduced automation effectiveness.

## Solution Statement

Enhance existing MCP and Skills CLI commands with comprehensive subcommand structure, rich status reporting with diagnostic information, authentication management, and agent capability discovery while preserving the established performance and architectural patterns.

## Metadata

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Type                   | ENHANCEMENT                                       |
| Complexity             | MEDIUM                                            |
| Systems Affected       | CLI commands, MCP management, Skills management, status reporting |
| Dependencies           | MCPManager, SkillsManager, existing CLI framework |
| Estimated Tasks        | 9                                                |
| **Research Timestamp** | **Feb 18, 2026 - Current documentation verified** |

---

## UX Design

### Before State
```
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────┐
│ DevOps Engineer │ ───── │ cia run "query" │ ───── │ AI Response      │
│ in CI/CD        │       │ with MCP/Skills │       │ (limited context)│
└─────────────────┘       └─────────────────┘       └──────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ USER PROBLEMS:                                                          │
│ • "What tools do you have?" → Generic, incomplete response             │
│ • Cannot discover available MCP servers and their status               │
│ • Cannot list available Skills                                         │
│ • Must guess tool names and capabilities                               │
│ • No MCP connection diagnostics                                        │
│ • No Skills management commands                                        │
│ • Agent capabilities are opaque black box                              │
└─────────────────────────────────────────────────────────────────────────┘

DATA_FLOW: User query → Generic AI response (no capability discovery)
```

### After State
```
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────┐
│ DevOps Engineer │ ───── │ CIA Enhanced    │ ───── │ Rich, Contextual │
│ in CI/CD        │       │ CLI Commands    │       │ Responses        │
└─────────────────┘       └─────────────────┘       └──────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ NEW CLI CAPABILITIES (Aligned with Claude Code + SkillCreator AI):     │
│                                                                         │
│ cia mcp add         → Add MCP servers (HTTP, SSE, stdio)               │
│ cia mcp list        → List all configured servers with status          │
│ cia mcp get         → Get detailed info for specific server            │
│ cia mcp remove      → Remove configured servers                        │
│ cia mcp status      → 🟢 Connected servers, tool counts, health info   │
│ cia mcp auth        → OAuth authentication flow                        │
│                                                                         │
│ cia skills install <name>        → Install from registry               │
│ cia skills install <owner/repo>  → Install from GitHub repo            │
│ cia skills install <git-url>     → Install from any git URL            │
│ cia skills install ./path        → Install from local path             │
│ cia skills uninstall <name>      → Remove installed skills             │
│ cia skills update <name>         → Update specific skill               │
│ cia skills list                  → Available skills with descriptions  │
│ cia skills info <name>           → Detailed skill information          │
│ cia skills refresh               → Reload skills from sources          │
│ cia skills search <query>        → Search skills by name/description   │
│                                                                         │
│ cia run "capabilities" → Comprehensive tool & skill inventory         │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ENHANCED STATUS REPORTING + SKILLCREATOR AI INSTALLATION PATTERNS:     │
│ • Status emojis (🟢🟡🔴❌🔐📝⚪❓)                                      │
│ • Connection health diagnostics                                         │
│ • Tool availability counts                                              │
│ • Skills discovery across multiple sources                             │
│ • SkillCreator AI-style universal installation (registry, GitHub,      │
│   git URLs, local paths)                                               │
│ • JSON and formatted output options                                     │
│ • Clear error messages and troubleshooting guidance                    │
└─────────────────────────────────────────────────────────────────────────┘

DATA_FLOW: Command → Manager Query → Formatted Report → User Action
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| `cia mcp` | Basic status command | `add`, `list`, `get`, `remove`, `status`, `auth` subcommands | DevOps engineers can manage MCP servers like Claude Code |
| `cia skills` | Basic list command | `install`, `uninstall`, `update`, `list`, `info`, `refresh`, `search` subcommands with SkillCreator AI-style arbitrary source support | Users get SkillCreator AI-style universal installation (GitHub, git URLs, local paths) plus discovery |
| `cia run "capabilities"` | Generic response | Comprehensive tool/skill inventory with usage examples | Agents provide specific, actionable capability lists |
| Error reporting | Basic error messages | Rich diagnostic information with emojis and guidance | Faster troubleshooting and clear status indicators |
| Status reporting | Limited CLI status | Health monitoring with connection diagnostics | Proactive issue identification and resolution |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/commands/mcp.ts` | all | Existing MCP command patterns to EXTEND exactly |
| P0 | `packages/cli/src/commands/skills.ts` | all | Existing Skills command patterns to EXTEND exactly |
| P1 | `packages/cli/src/shared/errors/error-handling.ts` | 36-181 | CommonErrors patterns to FOLLOW |
| P1 | `packages/cli/src/providers/mcp/manager.ts` | all | MCPManager interface and methods to USE |
| P1 | `packages/cli/src/skills/manager.ts` | all | SkillsManager interface and methods to USE |
| P2 | `packages/cli/src/cli.ts` | 10-134 | CLI routing and argument parsing to EXTEND |
| P2 | `packages/cli/tests/commands/mcp-basic.test.ts` | all | Test patterns to MIRROR exactly |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [Commander.js v12](https://github.com/tj/commander.js#defining-commands-and-subcommands) ✓ Current | Subcommand patterns | CLI command structure reference | Feb 18, 2026 |
| [Vitest v3.2](https://github.com/vitest-dev/vitest/blob/main/docs/guide/features.md) ✓ Current | Mock patterns | Testing CLI output and console | Feb 18, 2026 |
| [OpenCode MCP Management](https://opencode.ai/docs/mcp-servers/) ✓ Current | MCP best practices | Status reporting and OAuth flows | Feb 18, 2026 |
| [OpenCode Skills](https://opencode.ai/docs/skills/) ✓ Current | Skills discovery patterns | Multi-source skill management | Feb 18, 2026 |

---

## Patterns to Mirror

**CLI_COMMAND_ROUTING:**
```typescript
// SOURCE: packages/cli/src/cli.ts:120-134
// COPY THIS PATTERN:
switch (command.toLowerCase()) {
  case 'run':
    return await runCommand(positionals.slice(1), config);
  case 'models':
    return await modelsCommand(config);
  case 'mcp':
    return await mcpCommand(positionals.slice(1), config);
  case 'skills':
    return await skillsCommand(positionals.slice(1), config);
  default: {
    const error = CommonErrors.unknownCommand(command);
    printError(error);
    return error.code;
  }
}
```

**SUBCOMMAND_HANDLING:**
```typescript
// SOURCE: packages/cli/src/commands/mcp.ts:30-42
// COPY THIS PATTERN:
try {
  // Command logic here
  switch (subcommand.toLowerCase()) {
    case 'status':
      return await statusCommand();
    default: {
      const error = CommonErrors.unknownCommand(`mcp ${subcommand}`);
      printError(error);
      return error.code;
    }
  }
} catch (error) {
  const cliError = CommonErrors.operationFailed(
    'MCP command',
    error instanceof Error ? error.message : String(error)
  );
  printError(cliError);
  return cliError.code;
}
```

**ERROR_HANDLING:**
```typescript
// SOURCE: packages/cli/src/shared/errors/error-handling.ts:36-181
// COPY THIS PATTERN:
export const CommonErrors = {
  invalidArgument: (arg: string, expected: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Invalid argument: ${arg}`,
      `Expected: ${expected}`,
      'Check your command syntax with --help'
    ),
    
  operationFailed: (operation: string, reason: string): CliError =>
    createError(
      ExitCode.LLM_EXECUTION,
      `Operation failed: ${operation}`,
      reason,
      'Check your configuration and try again'
    ),
};
```

**STATUS_FORMATTING:**
```typescript
// SOURCE: packages/cli/src/commands/mcp.ts:207-219
// COPY THIS PATTERN:
function formatStatus(status: string): string {
  const statusEmojis: Record<string, string> = {
    connected: '🟢 Connected',
    connecting: '🟡 Connecting...',
    disconnected: '🔴 Disconnected',
    failed: '❌ Failed',
    needs_auth: '🔐 Authentication Required',
    needs_client_registration: '📝 Registration Required',
    disabled: '⚪ Disabled',
  };

  return statusEmojis[status] || `❓ ${status}`;
}
```

**CONSOLE_OUTPUT:**
```typescript
// SOURCE: packages/cli/src/commands/mcp.ts:54-69
// COPY THIS PATTERN:
console.log('MCP Server Status:');
console.log('==================');
console.log(`Total servers: ${healthInfo.serverCount}`);
console.log(`Connected: ${healthInfo.connectedServers}`);
console.log(`Available tools: ${healthInfo.toolCount}`);
console.log('');

for (const server of healthInfo.servers) {
  console.log(`${server.name}: ${formatStatus(server.status.status)}`);
  if (server.status.status === 'failed' && 'error' in server.status) {
    console.log(`  Error: ${server.status.error}`);
  }
}
```

**JSON_OUTPUT_SUPPORT:**
```typescript
// SOURCE: packages/cli/src/commands/models.ts:105-110
// COPY THIS PATTERN:
// Output in requested format
if (config.format === 'json') {
  console.log(JSON.stringify({ models: uniqueModels }, null, 2));
} else {
  // Default format: One model per line
  uniqueModels.forEach(model => console.log(model));
}
```

**TEST_STRUCTURE:**
```typescript
// SOURCE: packages/cli/tests/commands/mcp-basic.test.ts:1-26
// COPY THIS PATTERN:
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExitCode } from '../../src/utils/exit-codes.js';
import type { CIAConfig } from '../../src/shared/config/loader.js';

// Mock the MCP provider module
const mockMCPProvider = {
  initialize: vi.fn(),
  getHealthInfo: vi.fn(),
  getTools: vi.fn(),
};

vi.mock('../../src/providers/mcp.js', () => ({
  mcpProvider: mockMCPProvider,
}));

// Import after mocking
const { mcpCommand } = await import('../../src/commands/mcp.js');
```

---

## Current Best Practices Validation

**Security (Verified Current):**
- [x] OpenCode OAuth patterns followed (dynamic client registration, secure token storage)
- [x] MCP authentication flows validated against current spec
- [x] Skills permission system follows allow/deny/ask pattern
- [x] Input validation prevents command injection

**Performance (Verified Current):**
- [x] Lazy initialization patterns maintain <150ms constraint  
- [x] Manager caching strategies validated
- [x] Promise.allSettled() for parallel operations
- [x] Timeout enforcement prevents hanging

**Community Intelligence:**
- [x] Commander.js subcommand patterns confirmed current
- [x] Vitest mock patterns for CLI testing validated
- [x] OpenCode MCP/Skills patterns align with latest documentation
- [x] Status emoji conventions match established standards

---

## Files to Change

| File                             | Action | Justification                            |
| -------------------------------- | ------ | ---------------------------------------- |
| `packages/cli/src/commands/mcp.ts` | UPDATE | Add `add`, `list`, `get`, `remove`, `auth` subcommands aligned with Claude Code |
| `packages/cli/src/commands/skills.ts` | UPDATE | Add `info`, `refresh`, `search` subcommands |
| `packages/cli/src/providers/mcp/manager.ts` | UPDATE | Add Claude Code-compatible server management methods |
| `packages/cli/src/skills/manager.ts` | UPDATE | Add refresh and search methods if needed |
| `packages/cli/src/shared/errors/error-handling.ts` | UPDATE | Add new error types for enhanced commands |
| `packages/cli/tests/commands/mcp-enhanced.test.ts` | CREATE | Test new MCP subcommands following Claude Code patterns |
| `packages/cli/tests/commands/skills-enhanced.test.ts` | CREATE | Test new Skills subcommands |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **Interactive CLI menus**: Keep to simple subcommand pattern for CI/CD compatibility
- **Real-time status monitoring**: Static status reporting meets requirements
- **New authentication systems**: Existing OAuth and API key patterns are sufficient  
- **Plugin architecture**: Skills and MCP already provide extensibility
- **Complex configuration wizards**: Manual config editing maintains simplicity
- **Background daemon processes**: Maintain stateless CLI principle

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: build, functionally test, then run unit tests with coverage enabled. Prefer Makefile targets or package scripts when available (e.g., `make test`, `bun run test`).

**Coverage Target**: 60% (Extensions level per project requirements)

### Task 1: ENHANCE `packages/cli/src/commands/mcp.ts`

- **ACTION**: ADD new subcommands to align with Claude Code MCP command patterns
- **IMPLEMENT**: Add `add`, `list`, `get`, `remove`, `status`, `auth` subcommands following Claude Code standards
- **MIRROR**: `packages/cli/src/commands/mcp.ts:30-42` - follow existing switch pattern
- **IMPORTS**: No new imports needed - use existing mcpProvider
- **GOTCHA**: Must support HTTP, SSE, and stdio transports like Claude Code
- **CURRENT**: Reference verified Claude Code MCP management patterns from docs
- **CONFIG_CONFLICTS**: None - extending existing functionality
- **GENERATED_FILES**: None
- **VALIDATE**: `bun run type-check && bun run lint && bun run test packages/cli/tests/commands/mcp*`
- **FUNCTIONAL**: `./dist/cia mcp list && ./dist/cia mcp status && ./dist/cia mcp add --help`
- **TEST_PYRAMID**: Add integration test for: MCP subcommand routing aligned with Claude Code patterns

### Task 2: ENHANCE `packages/cli/src/commands/skills.ts` (Updated with SkillCreator AI Patterns)

- **ACTION**: ADD new subcommands aligned with SkillCreator AI universal installation patterns
- **IMPLEMENT**: Add `install`, `uninstall`, `info`, `refresh`, `search`, `update` subcommands with SkillCreator AI-style arbitrary source support
- **SKILLCREATOR_ALIGNMENT**: Support GitHub repos (`owner/repo`), git URLs, and local paths like SkillCreator AI
- **INSTALLATION_SOURCES**: 
  - `cia skills install <name>` (from registry)
  - `cia skills install <owner/repo>` (GitHub repos)
  - `cia skills install <git-url>` (any git URL - SSH/HTTPS)
  - `cia skills install ./path` (local paths)
- **MIRROR**: `packages/cli/src/commands/skills.ts:24-28` - follow existing manager initialization
- **IMPORTS**: May need git/fs utilities for arbitrary source handling
- **GOTCHA**: Skills installation from arbitrary sources requires security validation and error handling
- **CURRENT**: Reference verified SkillCreator AI installation patterns and OpenCode Skills discovery patterns
- **VALIDATE**: `bun run type-check && bun run lint && bun run test packages/cli/tests/commands/skills*`
- **FUNCTIONAL**: `./dist/cia skills install frontend-design && ./dist/cia skills install anthropics/skills && ./dist/cia skills install ./local-skill`
- **TEST_PYRAMID**: Add integration test for: SkillCreator AI-style installation from multiple source types

### Task 3: ENHANCE `packages/cli/src/shared/errors/error-handling.ts`

- **ACTION**: ADD new error types for enhanced CLI commands
- **IMPLEMENT**: mcpConnectionFailed, skillsDiscoveryFailed, authenticationRequired errors
- **MIRROR**: `packages/cli/src/shared/errors/error-handling.ts:36-181` - follow CommonErrors pattern
- **IMPORTS**: No new imports - extend existing CommonErrors object
- **GOTCHA**: Error messages should be actionable for DevOps engineers
- **CURRENT**: Reference established CLI error handling patterns
- **VALIDATE**: `bun run type-check && bun run lint`
- **TEST_PYRAMID**: Add unit tests for: new error types and message formatting

### Task 4: ADD enhanced status reporting to MCP manager (if needed)

- **ACTION**: EXTEND MCPManager with additional status methods
- **IMPLEMENT**: getDetailedStatus(), getConnectionDiagnostics() methods
- **MIRROR**: `packages/cli/src/providers/mcp/manager.ts:48-83` - follow existing async patterns
- **IMPORTS**: No new imports - extend existing manager class
- **GOTCHA**: Maintain backward compatibility with existing getHealthInfo()
- **CURRENT**: Reference verified OpenCode MCP management patterns  
- **VALIDATE**: `bun run type-check && bun run lint && bun run test packages/cli/tests/providers/mcp*`
- **FUNCTIONAL**: Verify enhanced status data in MCP commands
- **TEST_PYRAMID**: Add integration test for: enhanced status reporting with diagnostic information

### Task 5: ADD SkillCreator AI-style installation methods to Skills manager

- **ACTION**: EXTEND SkillsManager with SkillCreator AI-compatible installation capabilities
- **IMPLEMENT**: Add `installFromSource()`, `installFromGitHub()`, `installFromLocal()`, `uninstallSkill()`, `updateSkill()` methods
- **SKILLCREATOR_ALIGNMENT**: Support the same installation sources and patterns as SkillCreator AI universal installer
- **SOURCE_TYPES**: 
  - Registry skills (by name)
  - GitHub repositories (`owner/repo`, `owner/repo/subpath`)
  - Git URLs (SSH: `git@github.com:owner/repo.git`, HTTPS: `https://github.com/owner/repo.git`)
  - Local filesystem paths (`./my-skill`, `/absolute/path/to/skill`)
- **MIRROR**: `packages/cli/src/skills/manager.ts:26-59` - follow existing discovery patterns but add installation logic
- **IMPORTS**: Add git/fs utilities, path resolution, security validation
- **GOTCHA**: Need security validation for arbitrary sources, proper cleanup on failed installs
- **CURRENT**: Reference verified SkillCreator AI patterns and OpenCode Skills multi-source patterns
- **VALIDATE**: `bun run type-check && bun run lint && bun run test packages/cli/tests/skills*`
- **FUNCTIONAL**: Verify Skills installation from GitHub repos, git URLs, and local paths like SkillCreator AI
- **TEST_PYRAMID**: Add integration test for: SkillCreator AI-style installation from all supported source types

### Task 6: CREATE `packages/cli/tests/commands/mcp-enhanced.test.ts`

- **ACTION**: CREATE comprehensive tests for enhanced MCP commands
- **IMPLEMENT**: Test all new subcommands, error cases, status formatting
- **MIRROR**: `packages/cli/tests/commands/mcp-basic.test.ts:1-100` - follow existing test structure
- **PATTERN**: Use vi.mock() for provider, test console output and exit codes
- **CURRENT**: Reference verified Vitest CLI testing patterns
- **VALIDATE**: `bun run test packages/cli/tests/commands/mcp-enhanced.test.ts`
- **TEST_PYRAMID**: Add critical user journey test for: complete MCP management workflow

### Task 7: CREATE `packages/cli/tests/commands/skills-enhanced.test.ts`

- **ACTION**: CREATE comprehensive tests for SkillCreator AI-enhanced Skills commands  
- **IMPLEMENT**: Test SkillCreator AI-style installation, uninstall, update commands, plus discovery and search
- **SKILLCREATOR_TEST_CASES**: 
  - Install from registry: `cia skills install frontend-design`
  - Install from GitHub: `cia skills install anthropics/skills`
  - Install from git URL: `cia skills install git@github.com:anthropics/skills.git`
  - Install from local path: `cia skills install ./my-skill`
  - Uninstall and update workflows
- **MIRROR**: `packages/cli/tests/commands/skills.test.ts` (if exists) - follow existing patterns
- **PATTERN**: Mock SkillsManager, validate console output formatting, test error cases
- **CURRENT**: Reference verified Vitest mock patterns for managers and SkillCreator AI testing approaches
- **VALIDATE**: `bun run test packages/cli/tests/commands/skills-enhanced.test.ts`
- **TEST_PYRAMID**: Add critical user journey test for: Complete SkillCreator AI-style installation and management workflow

### Task 8: ENHANCE agent capability discovery responses

- **ACTION**: UPDATE run command to provide comprehensive capability listings
- **IMPLEMENT**: When agents are asked about capabilities, provide detailed tool/skill inventory
- **MIRROR**: `packages/cli/src/commands/run.ts` - follow existing query processing patterns
- **PATTERN**: Detect capability queries and enhance responses with status information
- **GOTCHA**: Must not impact normal query performance - only enhance specific capability requests
- **CURRENT**: Reference OpenCode agent enhancement patterns
- **VALIDATE**: `bun run type-check && bun run lint && bun run test packages/cli/tests/commands/run*`
- **FUNCTIONAL**: `./dist/cia run "What tools and skills do you have?" should return comprehensive inventory`
- **TEST_PYRAMID**: Add E2E test for: agent capability discovery and response enhancement

### Task 9: UPDATE README.md setup documentation

- **ACTION**: UPDATE README.md to document new CLI commands after implementation
- **IMPLEMENT**: Add documentation for enhanced MCP and Skills commands following SkillCreator AI patterns
- **SECTIONS_TO_UPDATE**:
  - CLI Commands section: Add new MCP subcommands (`add`, `list`, `get`, `remove`, `status`, `auth`)
  - Skills Management section: Add SkillCreator AI-style installation commands (`install`, `uninstall`, `update`)
  - Usage Examples: Show installation from GitHub repos, git URLs, and local paths
  - Getting Started: Update workflow to include skill installation examples
- **MIRROR**: Follow existing README formatting and documentation patterns
- **EXAMPLES_TO_ADD**:
  ```bash
  # MCP Server Management
  cia mcp list                          # List configured servers
  cia mcp add <server-config>           # Add new server
  cia mcp status                        # Health diagnostics
  
  # Skills Management (SkillCreator AI patterns)
  cia skills install frontend-design    # Install from registry
  cia skills install anthropics/skills  # Install from GitHub
  cia skills install ./my-skill         # Install from local path
  cia skills list                       # Show available skills
  ```
- **GOTCHA**: Update examples only AFTER implementation is complete and tested
- **VALIDATE**: Verify all documented commands actually work as described
- **FUNCTIONAL**: Test all README examples against the built CLI
- **TEST_PYRAMID**: Manual validation that README accurately reflects implemented functionality

---

## Testing Strategy

### Unit Tests to Write

| Test File                                | Test Cases                 | Validates      |
| ---------------------------------------- | -------------------------- | -------------- |
| `packages/cli/tests/commands/mcp-enhanced.test.ts` | New subcommands, error handling | MCP CLI enhancement |
| `packages/cli/tests/commands/skills-enhanced.test.ts` | Skills discovery, search | Skills CLI enhancement |
| `packages/cli/tests/shared/errors/enhanced-errors.test.ts` | New error types | Error handling patterns |

### Edge Cases Checklist

- [ ] MCP server connection failures during status check
- [ ] Skills discovery timeout from slow sources
- [ ] OAuth authentication flow interruption  
- [ ] Invalid subcommand arguments and validation
- [ ] JSON vs formatted output mode switching
- [ ] Manager initialization failures and recovery
- [ ] Partial results when some operations fail

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
bun run type-check && bun run lint
```

**EXPECT**: Exit 0, no TypeScript errors or linting issues

### Level 2: BUILD_AND_FUNCTIONAL

```bash
bun run build && ./dist/cia mcp status && ./dist/cia skills list
```

**EXPECT**: Build succeeds, enhanced CLI commands work correctly

### Level 3: UNIT_TESTS

```bash
bun run test -- --coverage packages/cli/tests/commands/mcp* packages/cli/tests/commands/skills*
```

**EXPECT**: All tests pass, coverage >= 60% for new functionality

**COVERAGE NOTE**: When running isolated tests, use module-specific coverage:
```bash
bun run test -- --coverage --collectCoverageFrom="packages/cli/src/commands/**" packages/cli/tests/commands/mcp* packages/cli/tests/commands/skills*
```

### Level 4: FULL_SUITE

```bash
bun run test -- --coverage && bun run build
```

**EXPECT**: All tests pass, full build succeeds

### Level 5: FUNCTIONAL_VALIDATION

```bash
# Test MCP management (aligned with Claude Code patterns)
./dist/cia mcp list
./dist/cia mcp status
./dist/cia mcp add --help
./dist/cia mcp get --help
./dist/cia mcp remove --help

# Test Skills management (SkillCreator AI patterns)
./dist/cia skills list
./dist/cia skills info --help
./dist/cia skills refresh
./dist/cia skills search --help

# Test SkillCreator AI-style installation patterns
./dist/cia skills install --help
./dist/cia skills install frontend-design      # from registry
./dist/cia skills install anthropics/skills    # from GitHub repo
./dist/cia skills uninstall --help
./dist/cia skills update --help

# Test enhanced agent responses
./dist/cia run "What tools and skills do you have?"
```

**EXPECT**: All commands work correctly with appropriate output formatting, following Claude Code command patterns and SkillCreator AI installation patterns

### Level 6: CURRENT_STANDARDS_VALIDATION

- [ ] All CLI patterns follow established Commander.js conventions
- [ ] Error handling uses verified CommonErrors patterns
- [ ] Status reporting uses current emoji and formatting standards  
- [ ] Testing follows current Vitest mock and assertion patterns
- [ ] Skills installation follows SkillCreator AI patterns for GitHub repos, git URLs, and local paths

### Level 7: MANUAL_VALIDATION

1. **MCP Server Management**: Verify status reporting shows accurate server health
2. **Skills Discovery**: Confirm Skills are discovered from all configured sources
3. **Authentication Flow**: Test OAuth flows work correctly for MCP servers
4. **Error Handling**: Verify error messages are actionable and helpful
5. **Performance**: Confirm CLI commands complete within performance constraints
6. **Output Formats**: Test both JSON and formatted output modes work correctly

---

## Acceptance Criteria

- [ ] All MCP management subcommands implemented following Claude Code patterns (`add`, `list`, `get`, `remove`, `status`, `auth`)
- [ ] All Skills management subcommands implemented with SkillCreator AI-style installation (`install`, `uninstall`, `update`, `list`, `info`, `refresh`, `search`)
- [ ] SkillCreator AI-compatible installation from arbitrary sources (registry, GitHub repos, git URLs, local paths)
- [ ] Enhanced agent capability responses provide comprehensive tool/skill inventory
- [ ] Status reporting includes diagnostic information with emoji formatting
- [ ] JSON and formatted output modes supported consistently
- [ ] Command patterns align with Claude Code + SkillCreator AI standards for familiar UX
- [ ] README.md setup documentation updated with all new CLI commands and usage examples
- [ ] All validation commands pass with exit 0
- [ ] Unit tests cover >= 60% of new functionality including SkillCreator AI-style installation workflows
- [ ] Performance maintains <150ms overhead constraint
- [ ] Code mirrors existing patterns exactly (naming, structure, error handling)
- [ ] No regressions in existing CLI functionality
- [ ] UX matches "After State" diagram specifications with SkillCreator AI patterns

---

## Completion Checklist

- [ ] Task 1: MCP command enhancement completed and validated
- [ ] Task 2: Skills command enhancement completed and validated
- [ ] Task 3: Enhanced error handling implemented
- [ ] Task 4: MCP manager extensions (if needed) completed
- [ ] Task 5: Skills manager extensions (if needed) completed
- [ ] Task 6: MCP enhanced tests created and passing
- [ ] Task 7: Skills enhanced tests created and passing
- [ ] Task 8: Agent capability discovery enhanced
- [ ] Task 9: README.md setup documentation updated with new CLI commands
- [ ] Level 1: Static analysis (lint + type-check) passes
- [ ] Level 2: Build and functional validation passes
- [ ] Level 3: Unit tests pass with coverage >= 60%
- [ ] Level 4: Full test suite + build succeeds
- [ ] Level 5: Functional validation of all commands passes
- [ ] Level 6: Current standards validation passes
- [ ] Level 7: Manual validation completed
- [ ] All acceptance criteria met

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 3 documentation queries (Commander.js, Vitest patterns, MCP standards)
**Web Intelligence Sources**: 4 community sources consulted (OpenCode MCP/Skills docs, GitHub MCP specification)
**Last Verification**: Feb 18, 2026 - All documentation links verified current
**Security Advisories Checked**: OAuth flows, Skills permissions, CLI input validation
**Deprecated Patterns Avoided**: Legacy Commander.js patterns, outdated testing approaches

---

## Risks and Mitigations

| Risk                                        | Likelihood   | Impact       | Mitigation                                    |
| ------------------------------------------- | ------------ | ------------ | --------------------------------------------- |
| Performance degradation with many MCP servers | MEDIUM       | HIGH         | Implement caching, timeouts, lazy loading patterns |
| Skills discovery timeout from slow sources | MEDIUM       | MEDIUM       | Use Promise.allSettled(), show partial results |
| OAuth authentication flow complexity | LOW          | MEDIUM       | Leverage existing OAuth manager, clear error messages |
| CLI command proliferation confusion | LOW          | LOW          | Follow established subcommand patterns, comprehensive help |
| Testing coverage gaps for edge cases | MEDIUM       | MEDIUM       | Comprehensive test suite with mock scenarios |
| Documentation changes during implementation | LOW          | MEDIUM       | Context7 MCP re-verification during execution |

---

## Notes

### Current Intelligence Considerations

This enhancement leverages the solid foundation already built in the ciagent codebase. The MCP and Skills managers are well-designed with health monitoring, OAuth support, and multi-source discovery. The CLI framework uses established patterns that are easily extensible.

**Claude Code Alignment**: After reviewing the official Claude Code MCP documentation at https://code.claude.com/docs/en/mcp, I've aligned our command structure with their patterns:

- `cia mcp add` - matches `claude mcp add` for server configuration
- `cia mcp list` - matches `claude mcp list` for listing servers
- `cia mcp get <name>` - matches `claude mcp get <name>` for server details  
- `cia mcp remove <name>` - matches `claude mcp remove <name>` for removal
- `cia mcp status` - enhanced status reporting (CIA-specific)
- `cia mcp auth` - matches OAuth authentication flows

**SkillCreator AI Alignment**: After reviewing SkillCreator AI at https://github.com/skillcreatorai/Ai-Agent-Skills, I've aligned our Skills installation with their universal patterns:

- `cia skills install <name>` - install from registry (matches `npx ai-agent-skills install <name>`)
- `cia skills install <owner/repo>` - install from GitHub repos (matches their GitHub support)
- `cia skills install <git-url>` - install from git URLs (matches their SSH/HTTPS git URL support)
- `cia skills install ./path` - install from local paths (matches their local path support)
- `cia skills uninstall <name>` - remove skills (matches their uninstall)
- `cia skills update <name>` - update skills (matches their update patterns)

This dual alignment ensures CIA CLI provides familiar patterns for users coming from both Claude Code (MCP management) and SkillCreator AI (Skills installation) while maintaining CIA-specific enhancements like comprehensive status reporting and diagnostics.

Key architectural insight: This is truly an ENHANCEMENT rather than new development, as most functionality already exists and just needs to be exposed through user-friendly CLI commands that follow industry standards from both Claude Code and SkillCreator AI.

Performance constraint (<150ms) is manageable because managers use lazy initialization and the CLI uses efficient Node.js parseArgs rather than heavy frameworks.

The implementation should be straightforward and low-risk because all foundational pieces are in place and tested, and we're following proven patterns from the two leading tools in this space.