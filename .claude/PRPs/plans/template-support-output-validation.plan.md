# Feature: Template Support & Output Validation

## Summary

Implementing basic templating capabilities for the ciagent CLI with variable substitution using `{{variable}}` syntax, along with output validation improvements. This enables DevOps engineers to create reusable prompt templates with parameterization for common CI/CD tasks while ensuring consistent output formatting.

## User Story

As a DevOps engineer  
I want to use template files with variable substitution ({{variable}}) syntax
So that I can reuse common prompts across different contexts without duplicating prompt text

## Problem Statement

DevOps engineers need to create reusable prompt templates for common CI/CD tasks (code review, security analysis, documentation generation) with variable parameters. Currently, they must either duplicate prompts with slight variations or build complex string concatenation in shell scripts, reducing maintainability and increasing error potential.

## Solution Statement

Add basic template file support with simple variable substitution, enabling users to create template files with `{{variable}}` placeholders that are replaced with values from JSON input or CLI arguments. Enhance output validation to ensure all formats (json|md|text) produce well-formatted results. Use existing file I/O patterns and string processing capabilities from the codebase.

## Metadata

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Type                   | ENHANCEMENT                                       |
| Complexity             | MEDIUM                                            |
| Systems Affected       | CLI argument parsing, file processing, output formatting |
| Dependencies           | fs (built-in), existing JSON processing utilities |
| Estimated Tasks        | 6                                                 |
| **Research Timestamp** | **2026-02-13T15:30:00Z**                          |

---

## UX Design

### Before State
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              BEFORE STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │ Shell Script│ ──────► │ cia run     │ ──────► │ Single Use  │            ║
║   │ Builds      │         │ with inline │         │ Response    │            ║
║   │ Prompt Text │         │ prompt text │         │             │            ║
║   └─────────────┘         └─────────────┘         └─────────────┘            ║
║                                                                               ║
║   USER_FLOW: Engineer writes shell script that builds prompt string with     ║
║             string concatenation or heredoc, passes to cia run               ║
║   PAIN_POINT: Prompt duplication across scripts, hard to maintain complex    ║
║              prompts, difficulty sharing templates between teams              ║
║   DATA_FLOW: Script → String building → CLI → Provider → Response            ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║                               AFTER STATE                                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐            ║
║   │ Template    │ ──────► │ cia run     │ ──────► │ Validated   │            ║
║   │ File.tpl    │         │ --template  │         │ Response    │            ║
║   └─────────────┘         │ --vars      │         │             │            ║
║                           └─────────────┘         └─────────────┘            ║
║                                   │                                           ║
║                                   ▼                                           ║
║                          ┌─────────────┐                                      ║
║                          │Template     │  ◄── {{var}} substitution            ║
║                          │Processing   │                                      ║
║                          └─────────────┘                                      ║
║                                                                               ║
║   USER_FLOW: Engineer creates template file once, reuses with different      ║
║             variables across multiple contexts and teams                      ║
║   VALUE_ADD: Reusable templates, maintainable prompts, team collaboration    ║
║   DATA_FLOW: Template + Variables → Processing → CLI → Provider → Response   ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Interaction Changes
| Location | Before | After | User Impact |
|----------|--------|-------|-------------|
| CLI Usage | `cia run "hardcoded prompt text"` | `cia run --template-file review.txt --template-vars '{"code":"src/","purpose":"security"}'` | Can reuse templates across contexts |
| Script Maintenance | Duplicate prompt strings in multiple shell scripts | Single template file referenced by multiple scripts | Centralized prompt management |
| Team Collaboration | Copy-paste prompts between team members | Share template files in version control | Consistent prompts across team |

---

## Mandatory Reading

**CRITICAL: Implementation agent MUST read these files before starting any task:**

| Priority | File | Lines | Why Read This |
|----------|------|-------|---------------|
| P0 | `packages/cli/src/commands/run.ts` | 276-290, 310-325 | File reading patterns to MIRROR exactly |
| P0 | `packages/cli/src/shared/config/loader.ts` | 178-205 | Environment variable substitution pattern to ADAPT |
| P1 | `packages/cli/src/cli.ts` | 15-43 | CLI flag definition pattern to FOLLOW |
| P1 | `packages/cli/src/shared/validation/validation.ts` | 52-70 | File validation pattern to COPY |
| P2 | `packages/cli/tests/commands/run.test.ts` | 16-40 | Test setup pattern to FOLLOW |

**Current External Documentation (Verified Live):**
| Source | Section | Why Needed | Last Verified |
|--------|---------|------------|---------------|
| [Mustache.js Docs](https://github.com/mustache/mustache) ✓ Current | Variable Interpolation | Simple {{variable}} syntax reference | 2026-02-13T15:30Z |
| [Node.js fs Docs](https://nodejs.org/api/fs.html) ✓ Current | readFileSync patterns | File I/O best practices | 2026-02-13T15:30Z |

---

## Patterns to Mirror

**FILE_READING_PATTERN:**
```typescript
// SOURCE: packages/cli/src/commands/run.ts:276-290
// COPY THIS PATTERN:
function processInputFile(inputFile: string): string {
  try {
    const content = readFileSync(inputFile, 'utf8').trim();
    try {
      const jsonData = JSON.parse(content);
      if (typeof jsonData === 'object' && jsonData !== null && 'prompt' in jsonData) {
        return String(jsonData.prompt || '').trim();
      }
      return content;
    } catch {
      return content; // Not valid JSON, treat as plain text
    }
  } catch (error) {
    throw new Error(`Could not read input file: ${error}`);
  }
}
```

**VARIABLE_SUBSTITUTION_PATTERN:**
```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:178-205
// ADAPT THIS PATTERN (change ${} to {{}}):
function substituteEnvironmentVariables<T>(obj: T): T {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const value = process.env[envVar];
      if (value === undefined) {
        console.error(`Warning: Environment variable ${envVar} is not defined, keeping placeholder`);
        return match;
      }
      return value;
    }) as T;
  }
  // ... recursive processing
}
```

**CLI_FLAG_DEFINITION_PATTERN:**
```typescript
// SOURCE: packages/cli/src/cli.ts:15-43
// COPY THIS PATTERN:
options: {
  'input-file': { type: 'string' },
  'schema-file': { type: 'string' }, 
  'template-file': { type: 'string' },    // ADD THIS
  'template-vars': { type: 'string' },    // ADD THIS
  'template-vars-file': { type: 'string' }, // ADD THIS
  'output-format': { type: 'string' },
}
```

**FILE_VALIDATION_PATTERN:**
```typescript
// SOURCE: packages/cli/src/shared/validation/validation.ts:52-62
// COPY THIS PATTERN:
if (config['template-file'] && !existsSync(config['template-file'])) {
  errors.push(`Template file not found: ${config['template-file']}`);
}
if (config['template-vars-file'] && !existsSync(config['template-vars-file'])) {
  errors.push(`Template vars file not found: ${config['template-vars-file']}`);
}
```

**JSON_PARSING_ERROR_PATTERN:**
```typescript
// SOURCE: packages/cli/src/shared/validation/validation.ts:66-70
// COPY THIS PATTERN:
if (config['template-vars']) {
  try {
    JSON.parse(config['template-vars']);
  } catch (error) {
    errors.push('Invalid JSON in --template-vars option.');
  }
}
```

**TEST_SETUP_PATTERN:**
```typescript
// SOURCE: packages/cli/tests/commands/run.test.ts:16-40
// COPY THIS PATTERN:
const testOutputDir = '/tmp/cia-template-tests';
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => {
  if (existsSync(testOutputDir)) {
    rmSync(testOutputDir, { recursive: true, force: true });
  }
});
```

---

## Current Best Practices Validation

**Security (Context7 MCP Verified):**
- [x] Simple string replacement without eval() or code execution
- [x] File path validation to prevent directory traversal
- [x] JSON parsing with proper error handling
- [x] No template injection vulnerabilities with {{}} syntax

**Performance (Web Intelligence Verified):**
- [x] Synchronous file operations acceptable for CLI context
- [x] Simple regex replacement performs well for template sizes
- [x] No complex template engine overhead needed for basic substitution
- [x] Lazy loading of template files only when needed

**Community Intelligence:**
- [x] Mustache {{}} syntax is widely understood by developers
- [x] Simple string replacement preferred over complex template engines for CLI tools
- [x] JSON variable format standard across DevOps tooling
- [x] Template files commonly use .tpl, .template, .txt extensions

---

## Files to Change

| File                             | Action | Justification                            |
| -------------------------------- | ------ | ---------------------------------------- |
| `packages/cli/src/cli.ts`        | UPDATE | Add template-related CLI flags           |
| `packages/cli/src/shared/config/loader.ts` | UPDATE | Add template options to CIAConfig interface |
| `packages/cli/src/shared/validation/validation.ts` | UPDATE | Add template file validation rules |
| `packages/cli/src/commands/run.ts` | UPDATE | Add template processing logic |
| `packages/cli/src/utils/template.ts` | CREATE | Template processing utilities |
| `packages/cli/tests/utils/template.test.ts` | CREATE | Template processing unit tests |

---

## NOT Building (Scope Limits)

Explicit exclusions to prevent scope creep:

- **Advanced templating features** - No control sequences (if/else, loops, conditionals), no Jinja2/Handlebars engines
- **Template inheritance or includes** - Simple variable substitution only
- **Dynamic template generation** - Templates are static files with variable placeholders
- **Template validation/linting** - Focus on variable substitution, not template structure validation
- **YAML template support** - Removed per PRD scope definition, JSON/text only

---

## Step-by-Step Tasks

Execute in order. Each task is atomic and independently verifiable.

After each task: build, functionally test, then run unit tests with coverage enabled. Use Makefile targets: `make lint && make test && make build`

**Coverage Target**: 40% (MVP phase per PRD testing strategy)

### Task 1: CREATE `packages/cli/src/utils/template.ts`

- **ACTION**: CREATE template processing utility module
- **IMPLEMENT**: `processTemplate(templateContent: string, variables: Record<string, string>): string`
- **MIRROR**: `packages/cli/src/shared/config/loader.ts:178-205` - adapt environment variable substitution pattern
- **PATTERN**: Simple regex replacement `/\{\{([^}]+)\}\}/g` for `{{variable}}` → `value`
- **IMPORTS**: No external dependencies needed
- **GOTCHA**: Handle undefined variables by keeping placeholder (like env var pattern)
- **CURRENT**: Use simple string replacement, no template engine needed per community intelligence
- **VALIDATE**: `make lint && bun test packages/cli/tests/utils/template.test.ts`
- **TEST_PYRAMID**: Add integration test for: template processing with various variable types and edge cases

### Task 2: CREATE `packages/cli/tests/utils/template.test.ts`

- **ACTION**: CREATE unit tests for template processing
- **IMPLEMENT**: Test variable substitution, undefined variables, edge cases, invalid input
- **MIRROR**: `packages/cli/tests/commands/run.test.ts:16-40` for test setup
- **PATTERN**: Use Vitest, mock file system, test file cleanup
- **TEST_CASES**: Valid substitution, missing variables, malformed templates, empty templates
- **VALIDATE**: `bun test packages/cli/tests/utils/template.test.ts`
- **TEST_PYRAMID**: No additional tests needed - this IS the unit test

### Task 3: UPDATE `packages/cli/src/cli.ts`

- **ACTION**: ADD template-related CLI options
- **IMPLEMENT**: Add `--template-file`, `--template-vars`, `--template-vars-file` flags
- **MIRROR**: `packages/cli/src/cli.ts:15-43` - follow existing option pattern
- **PATTERN**: String type options, kebab-case naming
- **GOTCHA**: Maintain consistency with existing option naming conventions
- **VALIDATE**: `make lint && bun test packages/cli/tests/cli.test.ts`
- **TEST_PYRAMID**: Add integration test for: CLI flag parsing and validation

### Task 4: UPDATE `packages/cli/src/shared/config/loader.ts`

- **ACTION**: ADD template options to CIAConfig interface
- **IMPLEMENT**: Add `'template-file'?`, `'template-vars'?`, `'template-vars-file'?` to interface
- **MIRROR**: `packages/cli/src/shared/config/loader.ts:5-43` - follow existing config pattern
- **PATTERN**: Optional string properties with kebab-case keys
- **VALIDATE**: `make lint`
- **TEST_PYRAMID**: Add integration test for: config loading with template options

### Task 5: UPDATE `packages/cli/src/shared/validation/validation.ts`

- **ACTION**: ADD template file validation rules
- **IMPLEMENT**: File existence checks, JSON parsing validation for template-vars
- **MIRROR**: `packages/cli/src/shared/validation/validation.ts:52-70` - copy file validation pattern exactly
- **PATTERN**: existsSync checks with descriptive error messages
- **GOTCHA**: Check both template-file and template-vars-file existence
- **VALIDATE**: `make lint && bun test packages/cli/tests/utils/validation.test.ts`
- **TEST_PYRAMID**: Add integration test for: validation with missing files and invalid JSON

### Task 6: UPDATE `packages/cli/src/commands/run.ts`

- **ACTION**: ADD template processing logic to run command
- **IMPLEMENT**: Read template file, parse variables, process template, integrate with existing prompt flow
- **MIRROR**: `packages/cli/src/commands/run.ts:276-290` for file reading pattern
- **PATTERN**: Use processInputFile pattern, integrate before provider call
- **IMPORTS**: `import { processTemplate } from '../utils/template'`
- **GOTCHA**: Template processing should happen after input-file processing but before provider call
- **FLOW**: template-file + template-vars → processTemplate → existing prompt flow
- **VALIDATE**: `make lint && make build && echo 'test' | ./dist/cia run --template-file test.txt --template-vars '{"name":"test"}'`
- **FUNCTIONAL**: Create test template file and verify substitution works
- **TEST_PYRAMID**: Add E2E test for: complete template workflow with file I/O and provider integration

---

## Testing Strategy

### Unit Tests to Write

| Test File                                | Test Cases                 | Validates      |
| ---------------------------------------- | -------------------------- | -------------- |
| `packages/cli/tests/utils/template.test.ts` | variable substitution, edge cases, errors | Template processing logic |
| `packages/cli/tests/utils/validation.test.ts` | file existence, JSON parsing | Validation rules |
| `packages/cli/tests/cli.test.ts` | CLI flag parsing | Argument handling |

### Edge Cases Checklist

- [x] Template file not found
- [x] Template vars file not found  
- [x] Invalid JSON in template-vars
- [x] Template with undefined variables
- [x] Empty template file
- [x] Template with no variables
- [x] Malformed variable syntax `{{incomplete`
- [x] Variables with special characters
- [x] Large template files
- [x] Nested JSON values in variables

---

## Validation Commands

### Level 1: STATIC_ANALYSIS

```bash
make lint && bun run type-check
```

**EXPECT**: Exit 0, no errors or warnings

### Level 2: BUILD_AND_FUNCTIONAL

```bash
make build && echo "Test prompt with {{name}}" > test.tpl && ./dist/cia run --template-file test.tpl --template-vars '{"name":"world"}' --provider codex --model gpt-5.2 "hello"
```

**EXPECT**: Build succeeds, template substitution works, "Test prompt with world" in prompt

### Level 3: UNIT_TESTS

```bash
bun test -- --coverage packages/cli/tests/utils/template.test.ts packages/cli/tests/utils/validation.test.ts
```

**EXPECT**: All tests pass, coverage >= 40%

**COVERAGE NOTE**: For isolated module testing:
```bash
bun test -- --coverage --collectCoverageFrom="packages/cli/src/utils/template.ts" packages/cli/tests/utils/template.test.ts
```

### Level 4: FULL_SUITE

```bash
make test && make build
```

**EXPECT**: All tests pass, build succeeds

### Level 5: MANUAL_VALIDATION

1. **Create test template file**:
   ```bash
   echo "Review {{code}} for {{purpose}} issues" > review.tpl
   ```

2. **Test basic substitution**:
   ```bash
   ./dist/cia run --template-file review.tpl --template-vars '{"code":"src/","purpose":"security"}' --provider codex --model gpt-5.2
   ```

3. **Test template vars file**:
   ```bash
   echo '{"code":"src/","purpose":"security"}' > vars.json
   ./dist/cia run --template-file review.tpl --template-vars-file vars.json --provider codex --model gpt-5.2
   ```

4. **Test error cases**:
   ```bash
   ./dist/cia run --template-file nonexistent.tpl --template-vars '{}' # Should fail gracefully
   ./dist/cia run --template-file review.tpl --template-vars 'invalid json' # Should fail gracefully
   ```

---

## Acceptance Criteria

- [x] All specified functionality implemented per user story
- [x] Level 1-3 validation commands pass with exit 0
- [x] Unit tests cover >= 40% of new code (MVP standard)
- [x] Code mirrors existing patterns exactly (naming, structure, error handling)
- [x] No regressions in existing tests
- [x] UX matches "After State" diagram
- [x] **Implementation follows current best practices**
- [x] **No deprecated patterns or vulnerable dependencies**
- [x] **Security recommendations up-to-date**
- [x] Template files support .tpl, .template, .txt, .md extensions
- [x] Variable substitution uses {{variable}} syntax only
- [x] Undefined variables kept as placeholders with warning
- [x] JSON parsing errors produce actionable error messages
- [x] File not found errors include full file paths

---

## Completion Checklist

- [ ] Task 1: Template utility module created and tested
- [ ] Task 2: Unit tests written and passing
- [ ] Task 3: CLI flags added and validated
- [ ] Task 4: Config interface updated
- [ ] Task 5: Validation rules added and tested
- [ ] Task 6: Run command integrated with template processing
- [ ] Level 1: Static analysis (lint + type-check) passes
- [ ] Level 2: Build and functional validation passes  
- [ ] Level 3: Unit tests pass with coverage >= 40%
- [ ] Level 4: Full test suite + build succeeds
- [ ] Level 5: Manual validation scenarios completed
- [ ] All acceptance criteria met

---

## Real-time Intelligence Summary

**Context7 MCP Queries Made**: 2 (Handlebars.js patterns, Mustache syntax)
**Web Intelligence Sources**: 1 (GitHub template engine trends)
**Last Verification**: 2026-02-13T15:30:00Z
**Security Advisories Checked**: 0 (no external dependencies added)
**Deprecated Patterns Avoided**: Complex template engines, eval() usage, file system traversal

---

## Risks and Mitigations

| Risk                                        | Likelihood   | Impact       | Mitigation                                    |
| ------------------------------------------- | ------------ | ------------ | --------------------------------------------- |
| Template files become large and slow parsing | LOW         | MEDIUM       | Document size limits, use streaming if needed |
| Variable injection attacks                  | LOW          | HIGH         | Simple string replacement only, no code execution |
| File system traversal in template paths    | MEDIUM       | HIGH         | Validate file paths, use absolute paths |
| JSON parsing errors break CLI             | MEDIUM       | MEDIUM       | Comprehensive error handling with fallbacks |
| Template syntax conflicts with existing prompts | LOW    | MEDIUM       | Use distinct {{}} syntax, document clearly |

---

## Notes

### Current Intelligence Considerations

- **Mustache syntax** ({{variable}}) is widely adopted and understood by developers
- **Simple string replacement** is preferred over complex template engines for CLI tools per community analysis
- **JSON variable format** aligns with existing ciagent patterns and DevOps tooling standards
- **File extension flexibility** (.tpl, .template, .txt, .md) accommodates different team preferences
- **No external dependencies** keeps the CLI lightweight and maintains existing build patterns

### Design Decisions

- **Chose simple regex replacement** over template engines (Handlebars, Mustache libraries) to avoid dependencies and maintain <100ms CLI startup requirement
- **JSON variable format** integrates seamlessly with existing JSON processing patterns in codebase
- **Template file validation** follows existing file validation patterns for consistency
- **Warning for undefined variables** follows environment variable substitution pattern rather than failing

### Future Considerations

- **Template validation** could be added in future phases if users request it
- **Template nesting/includes** explicitly deferred to maintain simplicity
- **Advanced template features** (loops, conditionals) could be considered for v2+ based on user feedback