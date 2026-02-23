# Investigation: 🔒 Critical: OAuth token expiration logic always returns false, preventing automatic token refresh

**Issue**: #67 (https://github.com/tbrandenburg/ciagent/issues/67)
**Type**: BUG
**Investigated**: 2026-02-23T15:45:00Z

### Assessment

| Metric     | Value    | Reasoning                                                                                                                                                          |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Severity   | HIGH     | Blocks automatic token refresh for all OAuth MCP servers, forcing manual re-authentication and causing authentication failures when tokens expire                 |
| Complexity | MEDIUM   | Requires modifying token interface, storage format, expiration logic, and adding backward compatibility - affects 3-4 files with some integration points        |
| Confidence | HIGH     | Clear root cause identified with hardcoded `return false`, exact location pinpointed, existing refresh logic confirmed functional, straightforward implementation |

---

## Problem Statement

The `isTokenExpired()` method in `McpOAuthProvider` always returns `false` due to hardcoded logic, preventing automatic OAuth token refresh and causing authentication failures when tokens actually expire.

---

## Analysis

### Root Cause / Change Rationale

The issue stems from incomplete implementation during OAuth 2.1 PKCE integration where token expiration checking was left as temporary "testing" code.

### Evidence Chain

WHY: OAuth tokens never refresh automatically, users get auth errors
↓ BECAUSE: `isTokenExpired()` always returns `false`
Evidence: `packages/cli/src/providers/mcp/auth.ts:412` - `return false; // Assume tokens are still valid for testing`

↓ BECAUSE: Method lacks proper expiration calculation
Evidence: `packages/cli/src/providers/mcp/auth.ts:411` - `// In a real implementation, we'd store the issued_at time and compare`

↓ BECAUSE: Token storage missing `issued_at` timestamp
Evidence: `packages/cli/src/providers/mcp/auth.ts:17-23` - OAuthTokens interface only has `expires_in` duration, not expiration timestamp

↓ ROOT CAUSE: Hardcoded `return false` prevents any expiration detection
Evidence: `packages/cli/src/providers/mcp/auth.ts:412` - `return false; // Assume tokens are still valid for testing`

### Affected Files

| File                                                           | Lines      | Action | Description                                          |
| -------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------- |
| `packages/cli/src/providers/mcp/auth.ts`                      | 17-23      | UPDATE | Add `issued_at` to OAuthTokens interface            |
| `packages/cli/src/providers/mcp/auth.ts`                      | 405-413    | UPDATE | Implement proper expiration calculation              |
| `packages/cli/src/providers/mcp/auth.ts`                      | 342-367    | UPDATE | Store `issued_at` in exchangeCodeForTokens           |
| `packages/cli/src/providers/mcp/auth.ts`                      | 372-400    | UPDATE | Store `issued_at` in refreshTokens                   |
| `packages/cli/tests/providers/mcp/auth.test.ts`               | NEW TESTS  | UPDATE | Add expiration and refresh scenario tests            |

### Integration Points

- `packages/cli/src/providers/mcp/auth.ts:182` - `getValidToken()` calls `isTokenExpired()`
- Token storage at `~/.cia/mcp-tokens/<serverId>.json` needs backward compatibility
- `refreshTokens()` method at lines 372-400 is functional and ready to be triggered
- Error handling integration with `CommonErrors.authenticationRequired()`

### Git History

- **Introduced**: b78e143 - 2026-02-22 - "Fix: Replace custom OAuth implementation with simple-oauth2 library (#54)"
- **Original**: d732d78 - 2026-02-17 - "feat(mcp): implement comprehensive MCP integration framework with OAuth 2.1 PKCE authentication"
- **Implication**: Temporary testing code that was never completed before production use

---

## Implementation Plan

### Step 1: Update OAuthTokens Interface

**File**: `packages/cli/src/providers/mcp/auth.ts`
**Lines**: 17-23
**Action**: UPDATE

**Current code:**

```typescript
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}
```

**Required change:**

```typescript
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  issued_at?: number;  // Unix timestamp when tokens were issued/refreshed
}
```

**Why**: Need to track when tokens were issued to calculate actual expiration time

---

### Step 2: Implement Proper Token Expiration Logic

**File**: `packages/cli/src/providers/mcp/auth.ts`
**Lines**: 405-413
**Action**: UPDATE

**Current code:**

```typescript
private isTokenExpired(tokens: OAuthTokens): boolean {
  if (!tokens.expires_in) {
    return false; // If no expiry info, assume valid
  }

  // For testing purposes, we'll be conservative and not refresh unless we have a proper timestamp
  // In a real implementation, we'd store the issued_at time and compare
  return false; // Assume tokens are still valid for testing
}
```

**Required change:**

```typescript
private isTokenExpired(tokens: OAuthTokens): boolean {
  if (!tokens.expires_in || !tokens.issued_at) {
    return false; // If no expiry info or timestamp, assume valid for backward compatibility
  }

  const currentTime = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  const expirationTime = tokens.issued_at + tokens.expires_in;
  
  // Add 5-minute buffer to refresh before actual expiration
  const bufferSeconds = 5 * 60;
  return currentTime >= (expirationTime - bufferSeconds);
}
```

**Why**: Calculate actual expiration based on issue time and duration, with safety buffer

---

### Step 3: Store Timestamps in Token Exchange

**File**: `packages/cli/src/providers/mcp/auth.ts`
**Lines**: 342-367
**Action**: UPDATE

**Current code:**

```typescript
// Around line 365 in exchangeCodeForTokens method
this.tokenStorage.setTokens(this.serverId, tokens);
```

**Required change:**

```typescript
// Add issued_at timestamp before storing
const tokensWithTimestamp = {
  ...tokens,
  issued_at: Math.floor(Date.now() / 1000)
};
this.tokenStorage.setTokens(this.serverId, tokensWithTimestamp);
```

**Why**: Store timestamp when tokens are first obtained

---

### Step 4: Store Timestamps in Token Refresh

**File**: `packages/cli/src/providers/mcp/auth.ts`
**Lines**: 372-400
**Action**: UPDATE

**Current code:**

```typescript
// Around line 395 in refreshTokens method
this.tokenStorage.setTokens(this.serverId, newTokens);
```

**Required change:**

```typescript
// Add issued_at timestamp before storing refreshed tokens
const tokensWithTimestamp = {
  ...newTokens,
  issued_at: Math.floor(Date.now() / 1000)
};
this.tokenStorage.setTokens(this.serverId, tokensWithTimestamp);
```

**Why**: Store timestamp when tokens are refreshed

---

### Step 5: Add Comprehensive Tests

**File**: `packages/cli/tests/providers/mcp/auth.test.ts`
**Action**: UPDATE

**Test cases to add:**

```typescript
describe("Token Expiration Logic", () => {
  it("should return false for tokens without expires_in", () => {
    const tokens: OAuthTokens = { access_token: "test" };
    const provider = createMcpOAuthProvider("test");
    expect(provider['isTokenExpired'](tokens)).toBe(false);
  });

  it("should return false for tokens without issued_at", () => {
    const tokens: OAuthTokens = { 
      access_token: "test", 
      expires_in: 3600 
    };
    const provider = createMcpOAuthProvider("test");
    expect(provider['isTokenExpired'](tokens)).toBe(false);
  });

  it("should return false for fresh tokens", () => {
    const tokens: OAuthTokens = {
      access_token: "test",
      expires_in: 3600,
      issued_at: Math.floor(Date.now() / 1000)
    };
    const provider = createMcpOAuthProvider("test");
    expect(provider['isTokenExpired'](tokens)).toBe(false);
  });

  it("should return true for expired tokens", () => {
    const tokens: OAuthTokens = {
      access_token: "test",
      expires_in: 3600,
      issued_at: Math.floor(Date.now() / 1000) - 3700 // Expired 100 seconds ago
    };
    const provider = createMcpOAuthProvider("test");
    expect(provider['isTokenExpired'](tokens)).toBe(true);
  });

  it("should trigger refresh when getValidToken() detects expired tokens", async () => {
    // Mock expired tokens and verify refresh is called
  });
});
```

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/providers/mcp/auth.ts:372-400
// Pattern for storing tokens with proper structure
const newTokens = await this.oauth2.getToken({
  grant_type: 'refresh_token',
  refresh_token: refreshToken,
});

this.tokenStorage.setTokens(this.serverId, newTokens);
return newTokens;
```

**Follow existing error handling patterns:**

```typescript
// SOURCE: packages/cli/src/providers/mcp/auth.ts:191-195
try {
  const refreshedTokens = await this.refreshTokens(tokens.refresh_token);
  return refreshedTokens;
} catch (error) {
  console.error(`Failed to refresh token for ${this.serverId}:`, error);
  this.tokenStorage.clearTokens(this.serverId);
  return null;
}
```

---

## Edge Cases & Risks

| Risk/Edge Case                          | Mitigation                                                     |
| --------------------------------------- | -------------------------------------------------------------- |
| Existing tokens without issued_at       | Return false (assume valid) for backward compatibility        |
| Clock skew between client and server    | Use 5-minute buffer before actual expiration                  |
| Tokens without expires_in               | Return false (assume valid) to avoid breaking existing flows  |
| Network failure during refresh          | Existing error handling clears tokens and returns null        |
| Race conditions in concurrent requests  | Token storage is file-based, naturally serialized             |

---

## Validation

### Automated Checks

```bash
# TypeScript compilation
bun run type-check

# Run OAuth-related tests
bun test -- auth

# Full test suite
bun test

# Linting
bun run lint
```

### Manual Verification

1. Create MCP OAuth connection and wait for token to approach expiration
2. Verify automatic refresh occurs before expiration (check logs)
3. Test with tokens that have no `issued_at` (backward compatibility)
4. Verify error handling when refresh fails
5. Check token file format includes `issued_at` field

---

## Scope Boundaries

**IN SCOPE:**

- Fix token expiration detection logic
- Add `issued_at` timestamp to token storage
- Update token acquisition and refresh to store timestamps
- Add comprehensive tests for expiration scenarios
- Maintain backward compatibility

**OUT OF SCOPE (do not touch):**

- OAuth discovery and authorization flow
- Token storage location or file format changes
- MCP protocol integration
- Error handling for non-expiration auth failures
- OAuth provider configuration or metadata handling

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-23T15:45:00Z
- **Artifact**: `.claude/PRPs/issues/issue-67.md`