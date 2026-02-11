# Investigation: 🔧 Core Functionality Broken: stdin pipe input not supported

**Issue**: #7 (https://github.com/tbrandenburg/ciagent/issues/7)
**Type**: BUG
**Investigated**: 2026-02-11T14:00:00Z

### Assessment

| Metric     | Value    | Reasoning                                                                                                                             |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Severity   | CRITICAL | Breaks core MVP functionality documented in PRD - pipe input is a fundamental requirement for CI/CD workflows and shell automation. |
| Complexity | LOW      | Single function needs enhancement, isolated change with clear implementation path, minimal integration risk.                          |
| Confidence | HIGH     | Root cause clearly identified in resolvePrompt function, strong evidence from code analysis, well-understood implementation needed. |

---

## Problem Statement

The `echo "prompt" | cia run` functionality is completely broken, failing the core MVP requirement from PRD. The CLI cannot read from stdin pipes, blocking essential CI/CD workflow integration and shell script automation patterns.

---

## Analysis

### Root Cause / Change Rationale

**5 Whys Analysis:**

WHY: `echo "Hello world" | cia run` fails with "Invalid argument: prompt"
↓ BECAUSE: `resolvePrompt()` function doesn't handle stdin input
Evidence: `packages/cli/src/commands/run.ts:199-209` - only checks args and input-file

↓ BECAUSE: Input validation logic assumes only two input sources exist
Evidence: `packages/cli/src/commands/run.ts:12-16` - `!hasPrompt && !hasInputFile` condition

↓ BECAUSE: stdin detection and reading logic was never implemented
Evidence: `git blame` shows resolvePrompt was introduced without stdin support in commit 37fdefbc

↓ ROOT CAUSE: Missing stdin reading logic in `resolvePrompt()` function
Evidence: `packages/cli/src/commands/run.ts:199-209` - incomplete input resolution

### Evidence Chain

WHY: Pipe input fails with validation error
↓ BECAUSE: `resolvePrompt()` returns empty string for piped input
Evidence: `packages/cli/src/commands/run.ts:208` - `return '';` when no args/file

↓ BECAUSE: No stdin detection or reading in resolvePrompt function
Evidence: `packages/cli/src/commands/run.ts:199-209` - missing stdin branch

↓ ROOT CAUSE: Incomplete implementation of input resolution
Evidence: `packages/cli/src/commands/run.ts:199-209` - function needs stdin support

### Affected Files

| File                                        | Lines   | Action | Description                       |
| ------------------------------------------- | ------- | ------ | --------------------------------- |
| `packages/cli/src/commands/run.ts`          | 199-209 | UPDATE | Add stdin reading to resolvePrompt|
| `packages/cli/src/commands/run.ts`          | 9-10    | UPDATE | Update input validation logic     |
| `packages/cli/tests/commands/run.test.ts`   | NEW     | UPDATE | Add stdin test cases              |

### Integration Points

- `packages/cli/src/commands/run.ts:18` calls resolvePrompt
- `packages/cli/src/commands/run.ts:12-16` validates input presence
- `packages/cli/src/commands/run.ts:19-23` validates prompt content
- `packages/cli/src/cli.ts:110` entry point for run command

### Git History

- **Introduced**: 37fdefbc - 2026-02-10 - "refactor(cli): streamline scaffold with codex/claude providers"
- **Last modified**: 37fdefbc - 2026-02-10
- **Implication**: Original implementation gap - stdin support was documented in PRD but never implemented

---

## Implementation Plan

### Step 1: Add stdin reading logic to resolvePrompt function

**File**: `packages/cli/src/commands/run.ts`
**Lines**: 199-209
**Action**: UPDATE

**Current code:**

```typescript
function resolvePrompt(args: string[], config: CIAConfig): string {
  if (args.length > 0) {
    return args.join(' ').trim();
  }

  if (config['input-file']) {
    return readFileSync(config['input-file'], 'utf8').trim();
  }

  return '';
}
```

**Required change:**

```typescript
function resolvePrompt(args: string[], config: CIAConfig): string {
  if (args.length > 0) {
    return args.join(' ').trim();
  }

  if (config['input-file']) {
    return readFileSync(config['input-file'], 'utf8').trim();
  }

  // Read from stdin if no args or file provided and stdin has data
  if (process.stdin.isTTY === false) {
    try {
      return readFileSync(0, 'utf8').trim(); // 0 = stdin file descriptor
    } catch (error) {
      // If stdin reading fails, return empty to trigger validation error
      return '';
    }
  }

  return '';
}
```

**Why**: Adds stdin detection using `process.stdin.isTTY === false` and synchronous reading using file descriptor 0, maintaining compatibility with existing error handling.

---

### Step 2: Update input validation to account for stdin

**File**: `packages/cli/src/commands/run.ts`
**Lines**: 9-16
**Action**: UPDATE

**Current code:**

```typescript
const hasPrompt = args.length > 0 && args.join(' ').trim().length > 0;
const hasInputFile = Boolean(config['input-file']);

if (!hasPrompt && !hasInputFile) {
  const error = CommonErrors.invalidArgument('prompt', 'a positional prompt or --input-file');
  printError(error);
  return error.code;
}
```

**Required change:**

```typescript
const hasPrompt = args.length > 0 && args.join(' ').trim().length > 0;
const hasInputFile = Boolean(config['input-file']);
const hasStdin = process.stdin.isTTY === false;

if (!hasPrompt && !hasInputFile && !hasStdin) {
  const error = CommonErrors.invalidArgument('prompt', 'a positional prompt, --input-file, or stdin pipe');
  printError(error);
  return error.code;
}
```

**Why**: Updates validation logic to recognize stdin as a valid input source and improves error message to inform users about all three input options.

---

### Step 3: Add comprehensive stdin test cases

**File**: `packages/cli/tests/commands/run.test.ts`
**Action**: UPDATE

**Test cases to add:**

```typescript
describe('stdin input', () => {
  it('should read prompt from stdin when piped', async () => {
    // Mock stdin as non-TTY with data
    const originalIsTTY = process.stdin.isTTY;
    const originalReadFileSync = readFileSync;
    
    process.stdin.isTTY = false;
    jest.mocked(readFileSync).mockImplementation((path) => {
      if (path === 0) return 'Hello from stdin';
      return originalReadFileSync(path, 'utf8');
    });

    const result = await runCommand([], {});
    
    expect(mockChat.sendQuery).toHaveBeenCalledWith('Hello from stdin', expect.any(String));
    process.stdin.isTTY = originalIsTTY;
  });

  it('should handle empty stdin gracefully', async () => {
    process.stdin.isTTY = false;
    jest.mocked(readFileSync).mockImplementation((path) => {
      if (path === 0) return '';
      throw new Error('Not stdin');
    });

    const result = await runCommand([], {});
    
    expect(result).toBe(ExitCode.INPUT_VALIDATION);
    expect(mockPrintError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('non-empty prompt')
      })
    );
  });

  it('should prioritize args over stdin when both present', async () => {
    process.stdin.isTTY = false;
    jest.mocked(readFileSync).mockImplementation((path) => {
      if (path === 0) return 'stdin content';
      throw new Error('Not stdin');
    });

    const result = await runCommand(['command line args'], {});
    
    expect(mockChat.sendQuery).toHaveBeenCalledWith('command line args', expect.any(String));
  });
});
```

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/commands/run.ts:204-206
// Pattern for file reading with error handling
if (config['input-file']) {
  return readFileSync(config['input-file'], 'utf8').trim();
}
```

```typescript
// SOURCE: packages/cli/tests/commands/run.test.ts:20-30
// Pattern for mocking in tests
beforeEach(() => {
  mockChat = {
    sendQuery: jest.fn().mockImplementation(async function* () {
      yield { type: 'assistant', content: 'ok' };
    }),
  };
  jest.mocked(createAssistantChat).mockReturnValue(mockChat);
});
```

---

## Edge Cases & Risks

| Risk/Edge Case                          | Mitigation                                      |
| --------------------------------------- | ----------------------------------------------- |
| Stdin reading fails/throws error       | Wrap in try-catch, return empty for validation |
| Multiple input sources provided         | Maintain priority: args > input-file > stdin   |
| TTY detection false positive           | Use file descriptor 0 reading with error handling |
| Large stdin input causing memory issues | Synchronous reading maintains existing behavior |
| Stdin available but empty               | Let validation error handle empty prompt case   |

---

## Validation

### Automated Checks

```bash
# Project uses Bun as runtime and package manager
bun run type-check     # TypeScript compilation check
bun test run.test.ts   # Run specific tests for run command
bun run lint           # Code style and quality checks
```

### Manual Verification

1. Test basic pipe: `echo "Hello world" | cia run` - should work without error
2. Test file input: `cat file.txt | cia run` - should read from stdin
3. Test arg priority: `echo "stdin" | cia run "args"` - should use args, not stdin
4. Test empty stdin: `echo "" | cia run` - should show validation error
5. Test non-piped usage: `cia run "prompt"` - should continue working as before

---

## Scope Boundaries

**IN SCOPE:**

- Adding stdin reading to resolvePrompt function
- Updating input validation logic
- Adding comprehensive test coverage for stdin scenarios
- Maintaining backward compatibility with args and file inputs

**OUT OF SCOPE (do not touch):**

- Async stdin reading (keep synchronous for consistency)
- Complex stdin buffering or streaming
- Changes to provider integrations or other commands
- Configuration file or environment variable changes
- Interactive prompts or TTY improvements

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-11T14:00:00Z
- **Artifact**: `.claude/PRPs/issues/issue-7.md`