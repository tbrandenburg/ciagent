# Investigation: Security: Pin axios to safe version 1.14.0 (supply chain attack CVE-2026)

**Issue**: #70 (https://github.com/tbrandenburg/ciagent/issues/70)
**Type**: CHORE
**Investigated**: 2026-04-01T16:30:00.000Z

### Assessment

| Metric     | Value    | Reasoning                                                                                          |
| ---------- | -------- | -------------------------------------------------------------------------------------------------- |
| Priority   | HIGH     | Security vulnerability affecting critical dependency; requires immediate action to prevent compromise |
| Complexity | LOW      | Single package.json change with lock file update; no code changes required                         |
| Confidence | HIGH     | Clear security advisory, specific versions identified, current status confirmed via lock file       |

---

## Problem Statement

The axios npm package was compromised in a supply chain attack on March 31, 2026, with malicious versions 1.14.1 and 0.30.4 published containing a Remote Access Trojan (RAT). The current package.json allows version range `^1.7.0` which includes the malicious `1.14.1`, but the lock file currently protects at version `1.13.5`. Immediate pinning to safe version `1.14.0` is required.

---

## Analysis

### Root Cause / Change Rationale

This is a **proactive security hardening** to prevent potential compromise during future dependency updates.

**WHY**: Package vulnerability allows malicious version installation
↓ BECAUSE: Semver range `^1.7.0` includes compromised `1.14.1`
Evidence: `packages/cli/package.json:29` - `"axios": "^1.7.0"`

↓ BECAUSE: Current protection relies only on lock file
Evidence: `bun.lock:379` - `axios@1.13.5` (safe but outdated)

↓ ROOT CAUSE: No explicit version pinning for security-critical dependencies
Evidence: Package configuration allows automatic updates to malicious versions

### Affected Files

| File                        | Lines | Action | Description                           |
| --------------------------- | ----- | ------ | ------------------------------------- |
| `packages/cli/package.json` | 29    | UPDATE | Pin axios version to exactly 1.14.0   |
| `bun.lock`                  | 379   | UPDATE | Update lock file to reflect new pin   |

### Integration Points

- `packages/cli/src/utils/http-client.ts:1` - Primary axios import and client factory
- `packages/cli/src/utils/github-api.ts:12` - Axios types for GitHub API integration  
- `packages/cli/src/providers/vercel-factory.ts:4,27,30` - Axios instance for AI SDK adapter
- **No breaking changes expected** - version 1.14.0 is compatible with current usage patterns

### Git History

- **Introduced**: 2b56ff04 - 2026-02-23 - "Fix: Replace custom networking/HTTP code with axios library (#57)"
- **Last modified**: 2b56ff04 - 2026-02-23
- **Implication**: Recently added dependency (Feb 23), no legacy compatibility concerns

---

## Implementation Plan

### Step 1: Pin axios version in package.json

**File**: `packages/cli/package.json`  
**Lines**: 29
**Action**: UPDATE

**Current code:**
```json
"axios": "^1.7.0"
```

**Required change:**
```json
"axios": "1.14.0"
```

**Why**: Remove semver range to prevent automatic updates to malicious versions, pin to last known safe version

---

### Step 2: Update lock file with exact version

**File**: `bun.lock`
**Action**: UPDATE (via bun command)

**Command to execute:**
```bash
bun add axios@1.14.0
```

**Expected result**: Lock file entry updates from `axios@1.13.5` to `axios@1.14.0`

**Why**: Ensure consistent version across all environments and CI builds

---

### Step 3: Verify no compromise indicators

**Action**: VERIFICATION

**Commands to run:**
```bash
# Verify no malicious packages
ls node_modules | grep plain-crypto
grep "plain-crypto-js" bun.lock
```

**Expected result**: No output (clean environment confirmed)

**Why**: Confirm current environment is not compromised before version update

---

## Patterns to Follow

**From codebase - maintain existing axios usage exactly:**

```typescript
// SOURCE: packages/cli/src/utils/http-client.ts:50-60  
// Pattern for axios client configuration - NO CHANGES NEEDED
const axiosConfig: AxiosRequestConfig = {
  timeout: clientConfig?.timeout || 30000,
  proxy: proxyConfig,
};
if (clientConfig?.baseURL) {
  axiosConfig.baseURL = clientConfig.baseURL;
}
const client = axios.create(axiosConfig);
```

**From codebase - maintain type imports pattern:**
```typescript
// SOURCE: packages/cli/src/utils/github-api.ts:12
// Pattern for type-only imports - NO CHANGES NEEDED  
import type { AxiosInstance, AxiosResponse } from 'axios';
```

---

## Edge Cases & Risks

| Risk/Edge Case                   | Mitigation                                           |
| -------------------------------- | ---------------------------------------------------- |
| Version 1.14.0 compatibility    | Version is close to current 1.13.5, minimal risk   |
| Breaking API changes             | Review axios changelog between 1.13.5 and 1.14.0   |
| CI pipeline dependency caching   | Update any cached layers after bun.lock changes     |
| Developer machine compromise     | Issue provides IoC checking procedures for team     |

---

## Validation

### Automated Checks

```bash
bun run type-check    # Verify TypeScript compilation with new axios version
bun test             # Run full test suite to verify HTTP client functionality  
bun run lint         # Ensure no linting issues
```

### Manual Verification

1. **Test HTTP client creation**: Verify `src/utils/http-client.ts` factory works correctly
2. **Test GitHub API integration**: Verify `src/utils/github-api.ts` requests function properly  
3. **Test Vercel provider**: Verify `src/providers/vercel-factory.ts` axios-to-fetch adapter works
4. **Verify no compromise**: Confirm no `plain-crypto-js` or connections to `sfrclak.com`

---

## Scope Boundaries

**IN SCOPE:**

- Pin axios to version 1.14.0 in package.json
- Update bun.lock file to reflect pinned version
- Verify environment is not compromised

**OUT OF SCOPE (do not touch):**

- Existing axios usage patterns (all are compatible)
- HTTP client configuration and interceptors
- Test mocking strategies  
- Network configuration (proxy, timeout, retry settings)
- Future axios version updates (separate security review required)

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-04-01T16:30:00.000Z
- **Artifact**: `.claude/PRPs/issues/issue-70.md`