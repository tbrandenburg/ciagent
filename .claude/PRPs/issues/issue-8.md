# Investigation: 📦 Binary Size Bloat: 103MB exceeds PRD target by 2x

**Issue**: #8 (https://github.com/tbrandenburg/ciagent/issues/8)
**Type**: ENHANCEMENT
**Investigated**: 2026-02-11T10:21:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                           |
| ---------- | ------ | --------------------------------------------------------------------------------------------------- |
| Priority   | HIGH   | Blocks production deployment and violates PRD container size requirements by over 200%             |
| Complexity | MEDIUM | Affects 3-4 build files, requires build process changes, but low risk with straightforward fixes   |
| Confidence | HIGH   | Clear root causes identified through dependency analysis and build configuration investigation      |

---

## Problem Statement

The compiled binary size is 103MB, exceeding the PRD requirement of <50MB container images by 106% (53MB over limit). This blocks production deployment and violates performance budgets.

---

## Analysis

### Root Cause / Change Rationale

Binary bloat is caused by multiple build configuration issues that bundle unnecessary development dependencies and debugging information into the production binary.

### Evidence Chain

WHY: Binary is 103MB instead of <50MB target
↓ BECAUSE: Build process includes development dependencies and debug info
Evidence: `packages/cli/package.json:14` - `bun build --compile --minify --sourcemap --bytecode src/cli.ts --outfile ../../dist/cia`

↓ BECAUSE: Sourcemaps are included in production builds
Evidence: `packages/cli/package.json:14` - `--sourcemap` flag adds ~10-15MB of debugging data

↓ BECAUSE: Large SDK dependencies are being bundled instead of loaded externally
Evidence: `node_modules/@openai: 325MB, @anthropic-ai: 69MB` vs expected dynamic loading at runtime

↓ ROOT CAUSE: Missing production build optimizations and improper dependency bundling
Evidence: No external dependency configuration, sourcemaps in production, no tree-shaking

### Affected Files

| File                             | Lines | Action | Description                         |
| -------------------------------- | ----- | ------ | ----------------------------------- |
| `packages/cli/package.json`      | 14    | UPDATE | Remove --sourcemap flag from build |
| `package.json`                   | 17    | UPDATE | Remove --sourcemap flag from build |
| `.github/workflows/release.yml`  | 40-43 | UPDATE | Update CI build commands            |
| `bun.config.js`                  | NEW   | CREATE | Add external dependency config      |

### Integration Points

- `packages/cli/src/cli.ts:1-10` - Entry point that loads providers
- `packages/cli/src/providers/codex.ts:61-68` - Dynamic Codex SDK import
- `packages/cli/src/providers/claude.ts:66` - Dynamic Claude SDK import
- `.github/workflows/ci.yml:86` - CI build process
- `.github/workflows/release.yml:40-43` - Release build process

### Git History

- **Introduced**: b200fec - 2026-02-11 - "feat(providers): implement provider reliability layer with retry logic and contract validation"
- **Last modified**: 37fdefb - 2026-02-11
- **Implication**: Recent feature additions may have introduced excessive bundling, issue is new

---

## Implementation Plan

### Step 1: Remove sourcemaps from production builds

**File**: `packages/cli/package.json`
**Lines**: 14
**Action**: UPDATE

**Current code:**

```json
"build": "bun build --compile --minify --sourcemap --bytecode src/cli.ts --outfile ../../dist/cia"
```

**Required change:**

```json
"build": "bun build --compile --minify --bytecode src/cli.ts --outfile ../../dist/cia"
```

**Why**: Sourcemaps add 10-15MB of debug information unnecessary for production

---

### Step 2: Remove sourcemaps from root package.json

**File**: `package.json`
**Lines**: 17
**Action**: UPDATE

**Current code:**

```json
"build": "cd packages/cli && bun build --compile --minify --sourcemap --bytecode src/cli.ts --outfile ../../dist/cia"
```

**Required change:**

```json
"build": "cd packages/cli && bun build --compile --minify --bytecode src/cli.ts --outfile ../../dist/cia"
```

**Why**: Consistent production build configuration across all build entry points

---

### Step 3: Create Bun external configuration

**File**: `bun.config.js`
**Action**: CREATE

**Required change:**

```javascript
import { BuildConfig } from 'bun';

const config: BuildConfig = {
  compile: {
    // Exclude large SDK dependencies from bundle
    external: [
      '@anthropic-ai/claude-agent-sdk',
      '@openai/codex-sdk'
    ]
  }
};

export default config;
```

**Why**: Ensures SDKs are loaded at runtime rather than bundled, following dynamic import pattern already in code

---

### Step 4: Update CI/CD build commands

**File**: `.github/workflows/release.yml`
**Lines**: 40-43
**Action**: UPDATE

**Current code:**

```yaml
- name: Build binaries
  run: |
    bun run build
    ls -la dist/
```

**Required change:**

```yaml
- name: Build binaries
  run: |
    bun run build
    ls -la dist/
    # Verify binary size meets PRD requirements
    size=$(stat -f%z dist/cia 2>/dev/null || stat -c%s dist/cia)
    if [ $size -gt 52428800 ]; then echo "Binary exceeds 50MB limit: ${size} bytes"; exit 1; fi
```

**Why**: Add size validation to prevent future regressions and catch bloat early

---

### Step 5: Add size monitoring script

**File**: `scripts/check-binary-size.sh`
**Action**: CREATE

**Required change:**

```bash
#!/bin/bash
# Check binary size compliance with PRD requirements

BINARY_PATH="dist/cia"
MAX_SIZE_MB=50
MAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))

if [ ! -f "$BINARY_PATH" ]; then
  echo "Binary not found at $BINARY_PATH"
  exit 1
fi

# Get file size (cross-platform)
if command -v stat >/dev/null 2>&1; then
  SIZE=$(stat -f%z "$BINARY_PATH" 2>/dev/null || stat -c%s "$BINARY_PATH")
else
  SIZE=$(ls -l "$BINARY_PATH" | awk '{print $5}')
fi

SIZE_MB=$((SIZE / 1024 / 1024))

echo "Binary size: ${SIZE_MB}MB (${SIZE} bytes)"
echo "PRD limit: ${MAX_SIZE_MB}MB (${MAX_SIZE_BYTES} bytes)"

if [ $SIZE -gt $MAX_SIZE_BYTES ]; then
  echo "❌ Binary exceeds PRD size limit by $((SIZE_MB - MAX_SIZE_MB))MB"
  exit 1
else
  echo "✅ Binary meets PRD size requirements"
fi
```

**Why**: Provides automated size checking for CI and local development

---

### Step 6: Update package.json with size check

**File**: `packages/cli/package.json`
**Lines**: 10-15
**Action**: UPDATE

**Current code:**

```json
"scripts": {
  "type-check": "bun tsc --noEmit",
  "test": "vitest",
  "test:coverage": "vitest --coverage",
  "build": "bun build --compile --minify --bytecode src/cli.ts --outfile ../../dist/cia"
}
```

**Required change:**

```json
"scripts": {
  "type-check": "bun tsc --noEmit",
  "test": "vitest",
  "test:coverage": "vitest --coverage",
  "build": "bun build --compile --minify --bytecode src/cli.ts --outfile ../../dist/cia && ../../scripts/check-binary-size.sh",
  "build:analyze": "bun build --compile --minify --bytecode --analyze src/cli.ts --outfile ../../dist/cia"
}
```

**Why**: Automatic size validation after builds and analysis option for debugging

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/providers/codex.ts:61-68
// Pattern for dynamic SDK loading (already implemented correctly)
const createCodexProvider = async (): Promise<CodexProvider> => {
  const { CodexClient } = await import('@openai/codex-sdk');
  return new CodexClient({
    apiKey: process.env.CODEX_API_KEY,
  });
};
```

```typescript
// SOURCE: packages/cli/src/providers/claude.ts:66
// Pattern for dynamic SDK loading (already implemented correctly)  
const createClaudeProvider = async (): Promise<ClaudeProvider> => {
  const { ClaudeClient } = await import('@anthropic-ai/claude-agent-sdk');
  return new ClaudeClient({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
};
```

---

## Edge Cases & Risks

| Risk/Edge Case                 | Mitigation                                                        |
| ------------------------------ | ----------------------------------------------------------------- |
| External deps not available    | Ensure runtime availability of SDKs via package.json deps        |
| Platform-specific builds      | Test size limits on all target platforms (Linux, macOS, Windows) |
| Performance regression        | Benchmark startup time before/after changes                      |
| CI build failure              | Add size check as warning first, then enforce after validation   |

---

## Validation

### Automated Checks

```bash
# Build and size validation
bun run build                     # Builds with size check
bun run type-check               # Type validation
bun test                         # Unit tests
bun run lint                     # Linting

# Size analysis
bun run build:analyze            # Bundle analysis
scripts/check-binary-size.sh     # Size compliance check
```

### Manual Verification

1. Build binary and verify size is <50MB: `ls -lah dist/cia`
2. Test binary functionality: `./dist/cia --version && ./dist/cia --help`
3. Test provider loading: `./dist/cia models` (if implemented)
4. Benchmark startup time: `time ./dist/cia --version` (should be <100ms on Pi 3)
5. Test in minimal container to verify runtime dependencies are available

---

## Scope Boundaries

**IN SCOPE:**

- Remove sourcemap flags from production builds
- Create external dependency configuration
- Add size validation to build process
- Update CI/CD pipelines with size checks

**OUT OF SCOPE (do not touch):**

- Provider implementation details (already correctly using dynamic imports)
- Core functionality or feature changes
- SDK version updates or replacements
- Container image optimization (separate from binary size)
- Alternative build systems (stick with Bun)

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-11T10:21:00Z
- **Artifact**: `.claude/PRPs/issues/issue-8.md`