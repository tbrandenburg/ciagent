# Investigation: Replace custom file utilities with specialized libraries

**Issue**: #56 (https://github.com/tbrandenburg/ciagent/issues/56)
**Type**: REFACTOR
**Investigated**: 2026-02-23T12:00:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                                      |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Priority   | MEDIUM | Important code quality improvement that enhances security and maintainability but not blocking other work     |
| Complexity | MEDIUM | Affects 2-4 files with integration points, moderate risk due to security-critical path traversal changes      |
| Confidence | HIGH   | Clear understanding of 393-line implementation, well-mapped dependencies, and battle-tested replacement libs   |

---

## Problem Statement

The 393-line `packages/cli/src/utils/file-utils.ts` contains custom implementations for file format detection, .gitignore parsing, and path security validation that duplicate functionality available in battle-tested libraries, creating maintenance burden and security risks.

---

## Analysis

### Change Rationale

Custom file handling code should be replaced with specialized libraries because:

1. **Security Risk**: Custom path traversal validation uses hardcoded patterns that may miss edge cases
2. **Maintenance Burden**: 55+ lines of custom .gitignore regex vs. battle-tested `ignore` library  
3. **Code Complexity**: 393 lines can be reduced to ~250-300 lines by leveraging existing dependencies
4. **Reliability**: Current implementation may miss .gitignore edge cases and YAML/JSON parsing nuances

### Evidence Chain

WHY: 393 lines of custom file handling code creates maintenance and security risks
↓ BECAUSE: Custom implementations duplicate functionality available in specialized libraries
Evidence: `packages/cli/src/utils/file-utils.ts:281-335` - 55 lines of custom .gitignore regex matching

↓ BECAUSE: .gitignore parsing uses basic regex that doesn't handle all standard patterns  
Evidence: `packages/cli/src/utils/file-utils.ts:318-335` - `matchesGitignorePattern()` function with simple pattern replacement

↓ BECAUSE: Path security validation uses hardcoded dangerous patterns
Evidence: `packages/cli/src/utils/file-utils.ts:342-359` - Array of hardcoded patterns: `['../', '..\\', '/etc/', ...]`

↓ ROOT CAUSE: Missing use of specialized libraries already available in ecosystem
Evidence: Issue proposes `gray-matter`, `ignore`, `path-scurry` - but exploration found `ignore` and `yaml` are better fits

### Affected Files

| File                                                  | Lines    | Action | Description                            |
| ----------------------------------------------------- | -------- | ------ | -------------------------------------- |
| `packages/cli/src/utils/file-utils.ts`               | 281-335  | UPDATE | Replace custom .gitignore with ignore  |
| `packages/cli/src/utils/file-utils.ts`               | 342-359  | UPDATE | Enhance path security validation       |
| `packages/cli/src/utils/file-utils.ts`               | 114-215  | UPDATE | Consider format detection improvements |
| `packages/cli/tests/utils/file-utils.test.ts`        | NEW      | CREATE | Direct unit tests for file utilities   |
| `packages/cli/package.json`                          | NEW      | UPDATE | Add ignore library dependency          |

### Integration Points

- `packages/cli/src/shared/validation/validation.ts:5,360,367,395,402` calls `isValidPath`, `pathExists`
- `packages/cli/src/utils/context-processors.ts:14-18,117,166,209` uses `loadFileWithFormatDetection`, `getFolderListing`, `pathExists`, `getPathStats`
- **Data Flow**: Raw paths → Security validation → Format detection → Content processing
- **Test Coverage**: Indirectly tested via `packages/cli/tests/utils/context-processors.test.ts:182-190,519-533`

### Git History

- **Introduced**: ae6d4e1 - 2026-02-17 - "feat(context): implement enhanced context handling with smart parameter resolution"
- **Last modified**: ae6d4e1 - 2026-02-17
- **Implication**: Recently added functionality, good opportunity to refactor before widespread adoption

---

## Implementation Plan

### Step 1: Add ignore library dependency

**File**: `packages/cli/package.json`
**Lines**: 19-34 (dependencies section)
**Action**: UPDATE

**Current dependency list:**
```json
"dependencies": {
  "@ai-sdk/azure": "^3.0.30",
  // ... other deps
  "yaml": "^2.8.2",
  "zod": "^4.3.6"
}
```

**Required change:**
```json
"dependencies": {
  "@ai-sdk/azure": "^3.0.30",
  // ... other deps
  "ignore": "^5.3.1",
  "yaml": "^2.8.2",
  "zod": "^4.3.6"
}
```

**Why**: Add battle-tested .gitignore parsing library

---

### Step 2: Replace custom .gitignore implementation

**File**: `packages/cli/src/utils/file-utils.ts`
**Lines**: 281-335
**Action**: UPDATE

**Current code:**
```typescript
// Lines 281-335
function loadGitignorePatterns(folderPath: string): string[] {
  // ... 20+ lines of custom file reading and parsing
}

function shouldIgnoreFile(relativePath: string, gitignorePatterns: string[]): boolean {
  // ... custom matching logic
}

function matchesGitignorePattern(path: string, pattern: string): boolean {
  // Convert gitignore pattern to regex
  let regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  if (pattern.endsWith('/')) {
    regexPattern = regexPattern.slice(0, -1) + '($|/.*)';
  }
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path) || regex.test(path + '/');
}
```

**Required change:**
```typescript
// Replace 55 lines with ignore library usage
import ignore from 'ignore';

function loadGitignorePatterns(folderPath: string): ReturnType<typeof ignore> | null {
  try {
    const gitignorePath = join(folderPath, '.gitignore');
    const content = readFileSync(gitignorePath, 'utf-8');
    return ignore().add(content);
  } catch {
    return null;
  }
}

function shouldIgnoreFile(relativePath: string, ig: ReturnType<typeof ignore> | null): boolean {
  return ig ? ig.ignores(relativePath) : false;
}

// Remove matchesGitignorePattern - no longer needed
```

**Why**: Replace 55 lines of error-prone regex with battle-tested library

---

### Step 3: Enhance path security validation

**File**: `packages/cli/src/utils/file-utils.ts`
**Lines**: 342-359
**Action**: UPDATE

**Current code:**
```typescript
// Lines 342-359
export function isValidPath(path: string): boolean {
  if (!path || path.trim() === '') {
    return false;
  }

  const dangerousPatterns = [
    '../', '..\\', '/etc/', '\\Windows\\', '/proc/', '/sys/', '~/',
  ];

  return !dangerousPatterns.some(pattern => path.includes(pattern));
}
```

**Required change:**
```typescript
import { resolve, relative } from 'node:path';

export function isValidPath(path: string): boolean {
  if (!path || path.trim() === '') {
    return false;
  }

  try {
    // Use Node.js path resolution for proper validation
    const resolved = resolve(path);
    const rel = relative(process.cwd(), resolved);
    
    // Check for path traversal outside current working directory
    if (rel.startsWith('..')) {
      return false;
    }
    
    // Additional security checks for system directories
    const normalized = resolved.toLowerCase();
    const dangerousPaths = ['/etc/', '/proc/', '/sys/', '/boot/'];
    if (process.platform === 'win32') {
      dangerousPaths.push('\\windows\\', '\\system32\\');
    }
    
    return !dangerousPaths.some(dangerous => normalized.includes(dangerous));
  } catch {
    return false; // Invalid path format
  }
}
```

**Why**: More robust security using Node.js path resolution instead of string matching

---

### Step 4: Update getFolderListing to use ignore library

**File**: `packages/cli/src/utils/file-utils.ts`
**Lines**: 222-276
**Action**: UPDATE

**Current code:**
```typescript
// Lines 222-276 - Uses custom .gitignore functions
export async function getFolderListing(folderPath: string): Promise<{
  files: string[];
  directories: string[];
}> {
  // ... validation logic
  
  const gitignorePatterns = loadGitignorePatterns(folderPath);
  
  // ... directory traversal
  
  if (!shouldIgnoreFile(relativePath, gitignorePatterns)) {
    // ... add to results
  }
}
```

**Required change:**
```typescript
export async function getFolderListing(folderPath: string): Promise<{
  files: string[];
  directories: string[];
}> {
  // ... validation logic (unchanged)
  
  const ig = loadGitignorePatterns(folderPath);
  
  // ... directory traversal (unchanged)
  
  if (!shouldIgnoreFile(relativePath, ig)) {
    // ... add to results (unchanged)
  }
}
```

**Why**: Update to use new ignore library interface

---

### Step 5: Create comprehensive test suite

**File**: `packages/cli/tests/utils/file-utils.test.ts`
**Action**: CREATE

**Test cases to add:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getFileMetadata,
  loadFileWithFormatDetection,
  getFolderListing,
  isValidPath,
  pathExists,
  getPathStats,
} from '../../src/utils/file-utils.js';

describe('file-utils', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'file-utils-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('isValidPath', () => {
    it('should accept valid relative paths', () => {
      expect(isValidPath('src/utils/test.ts')).toBe(true);
      expect(isValidPath('./config.json')).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(isValidPath('../../../etc/passwd')).toBe(false);
      expect(isValidPath('..\\..\\Windows\\system32')).toBe(false);
    });

    it('should reject system directory access', () => {
      expect(isValidPath('/etc/passwd')).toBe(false);
      expect(isValidPath('/proc/version')).toBe(false);
    });

    it('should reject empty or invalid paths', () => {
      expect(isValidPath('')).toBe(false);
      expect(isValidPath('   ')).toBe(false);
    });
  });

  describe('getFolderListing', () => {
    it('should respect .gitignore patterns', () => {
      writeFileSync(join(testDir, '.gitignore'), 'node_modules/\n*.log\n.env\n');
      writeFileSync(join(testDir, 'package.json'), '{}');
      writeFileSync(join(testDir, 'debug.log'), 'logs');
      writeFileSync(join(testDir, '.env'), 'secret');
      
      const result = getFolderListing(testDir);
      
      expect(result.files).toContain('package.json');
      expect(result.files).not.toContain('debug.log');
      expect(result.files).not.toContain('.env');
    });

    it('should handle nested .gitignore files', () => {
      // Test hierarchical .gitignore behavior
    });
  });

  describe('loadFileWithFormatDetection', () => {
    it('should detect YAML frontmatter', () => {
      const yamlFile = join(testDir, 'test.md');
      writeFileSync(yamlFile, '---\ntitle: Test\n---\n# Content');
      
      const result = loadFileWithFormatDetection(yamlFile);
      expect(result.metadata.title).toBe('Test');
    });

    it('should fallback through format detection chain', () => {
      // Test YAML → JSON → text fallback
    });
  });
});
```

**Why**: Direct unit tests for improved reliability and easier debugging

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/utils/file-utils.ts:79-109
// Pattern for format detection with error handling
export async function loadFileWithFormatDetection(filePath: string) {
  try {
    if (!pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const parsed = attemptSmartParsing(content);
    
    return {
      success: true,
      content: parsed.content,
      metadata: parsed.metadata,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

---

## Edge Cases & Risks

| Risk/Edge Case                | Mitigation                                          |
| ----------------------------- | --------------------------------------------------- |
| Breaking existing tests       | Run full test suite, update context-processors tests as needed |
| Path security regression      | Comprehensive security test cases for edge cases   |
| .gitignore behavior changes   | Test against standard .gitignore patterns          |
| Performance regression        | Benchmark directory traversal before/after         |
| Cross-platform path handling  | Test on Windows-style paths and Unix paths         |

---

## Validation

### Automated Checks

```bash
# Type checking
bun run type-check

# Run all tests including new file-utils tests  
bun test packages/cli/tests/utils/file-utils.test.ts

# Run integration tests to ensure no regression
bun test packages/cli/tests/utils/context-processors.test.ts

# Lint the updated code
bun run lint

# Build to ensure no build errors
bun run build:dev
```

### Manual Verification

1. Test file format detection works with YAML, JSON, and text files
2. Verify .gitignore filtering handles standard patterns (node_modules/, *.log, etc.)
3. Confirm path traversal protection still blocks dangerous paths
4. Test that context processors still work with refactored file utilities

---

## Scope Boundaries

**IN SCOPE:**
- Replace custom .gitignore parsing with `ignore` library
- Enhance path security validation using Node.js path resolution
- Add comprehensive unit tests for file utilities
- Update integration points in getFolderListing

**OUT OF SCOPE (do not touch):**
- YAML/JSON parsing logic (already uses `yaml` library effectively)
- File metadata extraction (Node.js fs operations are appropriate)
- Context processor integration logic
- Command-level interfaces

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-23T12:00:00Z
- **Artifact**: `.claude/PRPs/issues/issue-56.md`