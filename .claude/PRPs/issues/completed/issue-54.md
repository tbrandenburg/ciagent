# Investigation: Replace custom OAuth implementation with simple-oauth2 library

**Issue**: #54 (https://github.com/tbrandenburg/ciagent/issues/54)
**Type**: REFACTOR
**Investigated**: 2026-02-22T19:24:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                                                                    |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Priority   | MEDIUM | Important security and maintainability improvement, but OAuth functionality is not currently used in production, reducing urgent user impact |
| Complexity | HIGH   | Requires rewriting 408-line authentication system, updating tests, and ensuring backward compatibility for token storage                     |
| Confidence | HIGH   | Clear scope, existing implementation is well-documented, and simple-oauth2 library is battle-tested with comprehensive PKCE support        |

---

## Problem Statement

The current OAuth 2.1 PKCE implementation in `packages/cli/src/providers/mcp/auth.ts` is a 408-line custom security-sensitive implementation that duplicates functionality available in established libraries. This creates security risks, maintenance overhead, and potential for OAuth-related bugs in production systems.

---

## Analysis

### Change Rationale

The current custom OAuth implementation poses several risks and inefficiencies:

1. **Security Risk**: Manual implementation of security-sensitive OAuth flows increases vulnerability surface
2. **Maintenance Burden**: 408 lines of custom OAuth code requires ongoing security updates and bug fixes  
3. **Standards Compliance**: Custom implementation may not properly handle all OAuth 2.1 edge cases
4. **Complexity**: Manual PKCE parameter generation, state management, and token handling

Replacing with `simple-oauth2` library provides:
- Battle-tested OAuth 2.1 implementation
- Reduced codebase complexity (408 → ~50-100 lines)
- Automatic security updates via library maintainers
- Standards-compliant PKCE and OAuth flows

### Current Implementation Analysis

**Current State**: The OAuth implementation exists but is **NOT ACTIVELY USED**:

- `McpManager.createRemoteConnection()` has OAuth commented out: `// For now, OAuth is not implemented in this basic version`
- CLI `mcp auth` command only prints placeholder messages
- No HTTP server exists to handle OAuth callbacks (expects `http://127.0.0.1:19876/mcp/oauth/callback`)

### Affected Files

| File                                                         | Lines    | Action | Description                                    |
| ------------------------------------------------------------ | -------- | ------ | ---------------------------------------------- |
| `packages/cli/package.json`                                 | 29       | UPDATE | Add simple-oauth2 dependency                   |
| `packages/cli/src/providers/mcp/auth.ts`                    | 1-408    | UPDATE | Complete rewrite using simple-oauth2          |
| `packages/cli/tests/providers/mcp/auth.test.ts`             | 1-306    | UPDATE | Update tests for new library integration      |
| `packages/cli/src/providers/mcp/manager.ts`                 | 281,328  | UPDATE | Enable OAuth integration in connection logic  |
| `packages/cli/src/commands/mcp.ts`                          | 363-367  | UPDATE | Implement actual auth command functionality   |
| `packages/cli/src/shared/config/schema.ts`                  | 17-28    | REVIEW | Verify OAuth config schema compatibility      |

### Integration Points

- `MCPManager.createRemoteConnection()` (line 272-346) needs OAuth token injection
- Token storage location `~/.cia/mcp-tokens/` should remain compatible
- CLI command `mcp auth` needs full implementation
- Configuration validation in schema.ts for OAuth settings
- Test mocks for OAuth flows need updating

### Git History

- **Introduced**: d732d78 - 2026-02-17 - "feat(mcp): implement comprehensive MCP integration framework with OAuth 2.1 PKCE authentication"
- **Last modified**: Recent commits in February 2026
- **Implication**: Recently implemented feature (5 days old), currently unused in production, making refactoring safe

---

## Implementation Plan

### Step 1: Add simple-oauth2 dependency

**File**: `packages/cli/package.json`  
**Lines**: Dependencies section
**Action**: UPDATE

**Current code:**

```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.26.0",
  "open": "^11.0.0"
}
```

**Required change:**

```json
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.26.0", 
  "open": "^11.0.0",
  "simple-oauth2": "^4.2.0"
}
```

**Why**: Add battle-tested OAuth library with PKCE support

---

### Step 2: Research simple-oauth2 PKCE capabilities

**File**: Create temporary research file
**Action**: CREATE

**Research points:**
- Verify PKCE support in simple-oauth2 v4.2.0
- Check authorization code flow implementation
- Understand token refresh mechanisms
- Review callback handling patterns

**Why**: Ensure library supports all current OAuth features

---

### Step 3: Rewrite auth.ts using simple-oauth2

**File**: `packages/cli/src/providers/mcp/auth.ts`
**Lines**: 1-408 (complete rewrite)
**Action**: UPDATE

**Current approach:** Manual PKCE implementation with custom classes

**Required change:** Library-based implementation following this structure:

```typescript
import { ClientCredentials, AuthorizationCode } from 'simple-oauth2';

export class McpOAuthProvider {
  private oauth2: AuthorizationCode;
  
  constructor(config: OAuthConfig) {
    this.oauth2 = new AuthorizationCode({
      client: {
        id: config.clientId,
        secret: config.clientSecret
      },
      auth: {
        tokenHost: config.tokenEndpoint,
        authorizeHost: config.authorizationEndpoint
      }
    });
  }
  
  async authorize(): Promise<string> {
    return this.oauth2.authorizeURL({
      redirect_uri: 'http://127.0.0.1:19876/mcp/oauth/callback',
      scope: this.config.scope,
      code_challenge_method: 'S256',
      code_challenge: this.generateCodeChallenge()
    });
  }
  
  // Implement remaining methods with ~50-100 lines total
}
```

**Why**: Replace 408 lines of custom OAuth with library-based approach

---

### Step 4: Preserve token storage compatibility

**File**: `packages/cli/src/providers/mcp/auth.ts`
**Lines**: TokenStorage class (55-110)
**Action**: UPDATE

**Current code:**
```typescript
class TokenStorage {
  private tokenPath: string;
  
  constructor(serverId: string) {
    const tokenDir = path.join(os.homedir(), '.cia', 'mcp-tokens');
    this.tokenPath = path.join(tokenDir, `${serverId}.json`);
  }
  
  async store(token: OAuthToken): Promise<void> {
    await fs.mkdir(path.dirname(this.tokenPath), { recursive: true });
    await fs.writeFile(this.tokenPath, JSON.stringify(token, null, 2));
  }
}
```

**Required change:**
```typescript  
class TokenStorage {
  // Keep existing file-based storage structure
  // Adapt to work with simple-oauth2 token format
  // Maintain backward compatibility for existing tokens
  
  async store(accessToken: AccessToken): Promise<void> {
    const token = {
      access_token: accessToken.token.access_token,
      refresh_token: accessToken.token.refresh_token,
      expires_in: accessToken.token.expires_in,
      token_type: accessToken.token.token_type || 'Bearer',
      scope: accessToken.token.scope
    };
    await fs.writeFile(this.tokenPath, JSON.stringify(token, null, 2));
  }
}
```

**Why**: Maintain compatibility with existing stored tokens

---

### Step 5: Add HTTP callback server

**File**: `packages/cli/src/providers/mcp/auth.ts`  
**Lines**: New implementation needed
**Action**: CREATE

**Required implementation:**

```typescript
private async startCallbackServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/mcp/oauth/callback')) {
        const url = new URL(req.url, `http://localhost:${port}`);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        
        // Validate and exchange code for token
        this.handleCallback(code, state, res);
        server.close();
      }
    });
    
    server.listen(19876, '127.0.0.1', () => resolve(19876));
    server.on('error', reject);
  });
}
```

**Why**: Handle OAuth callbacks that current implementation expects but doesn't provide

---

### Step 6: Update tests for library integration

**File**: `packages/cli/tests/providers/mcp/auth.test.ts`
**Lines**: 1-306 (significant updates needed)
**Action**: UPDATE

**Current tests:** Mock `@modelcontextprotocol/sdk/client/auth.js` and `open`

**Required changes:**

```typescript
import { AuthorizationCode } from 'simple-oauth2';

// Mock simple-oauth2 instead of custom implementation
vi.mock('simple-oauth2', () => ({
  AuthorizationCode: vi.fn().mockImplementation(() => ({
    authorizeURL: vi.fn().mockReturnValue('https://auth.example.com/authorize?...'),
    getToken: vi.fn().mockResolvedValue({
      token: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600
      }
    })
  }))
}));

describe('McpOAuthProvider with simple-oauth2', () => {
  // Update all tests to work with library integration
  // Keep same test scenarios but adapt expectations
  // Ensure security features still work (PKCE, state validation)
});
```

**Why**: Ensure test coverage for new library-based implementation

---

### Step 7: Enable OAuth in MCP Manager

**File**: `packages/cli/src/providers/mcp/manager.ts`
**Lines**: 281, 328-334
**Action**: UPDATE  

**Current code:**
```typescript
// Line 281
// For now, OAuth is not implemented in this basic version

// Lines 328-334  
if (error instanceof UnauthorizedError) {
  console.error(`❌ Server ${serverId} requires authentication but OAuth is not yet implemented`);
  return null;
}
```

**Required change:**
```typescript
// Line 281 - Remove comment, implement OAuth
if (config.oauth && config.oauth !== false) {
  const authProvider = new McpOAuthProvider(config.oauth, serverId);
  // Get or refresh token before connection
  const token = await authProvider.getValidToken();
  headers['Authorization'] = `Bearer ${token.access_token}`;
}

// Lines 328-334 - Trigger OAuth flow on unauthorized
if (error instanceof UnauthorizedError) {
  if (config.oauth && config.oauth !== false) {
    console.log(`🔐 Authentication required for ${serverId}. Use: cia mcp auth ${serverId}`);
    return null;
  }
  console.error(`❌ Server ${serverId} requires authentication but no OAuth config provided`);
  return null;
}
```

**Why**: Actually use the OAuth implementation in production connections

---

### Step 8: Implement mcp auth CLI command

**File**: `packages/cli/src/commands/mcp.ts`
**Lines**: 363-367
**Action**: UPDATE

**Current code:**
```typescript
async function authCommand() {
  console.log('🔐 MCP Authentication');
  console.log('   OAuth flows will be implemented in a future version');
  console.log('   For now, use servers that don\'t require authentication');
}
```

**Required change:**
```typescript
async function authCommand(serverId?: string) {
  if (!serverId) {
    console.log('Usage: cia mcp auth <server-id>');
    return;
  }

  const config = await loadConfig();
  const serverConfig = config.mcp?.servers?.[serverId];
  
  if (!serverConfig?.oauth || serverConfig.oauth === false) {
    console.error(`❌ No OAuth configuration for server: ${serverId}`);
    return;
  }

  console.log(`🔐 Starting OAuth flow for ${serverId}...`);
  
  const authProvider = new McpOAuthProvider(serverConfig.oauth, serverId);
  try {
    await authProvider.authorize();
    console.log(`✅ Successfully authenticated with ${serverId}`);
  } catch (error) {
    console.error(`❌ Authentication failed: ${error.message}`);
  }
}
```

**Why**: Provide working OAuth authentication command for users

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/providers/mcp/manager.ts:20-30
// Pattern for error handling with specific error types
try {
  // operation
} catch (error) {
  if (error instanceof UnauthorizedError) {
    // specific handling
  } else if (error instanceof Error) {
    // general error handling
  }
}
```

```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:25-35  
// Pattern for configuration loading and validation
export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();
  const configContent = await fs.readFile(configPath, 'utf8');
  const rawConfig = JSON.parse(configContent);
  return validateConfig(rawConfig);
}
```

---

## Edge Cases & Risks

| Risk/Edge Case                    | Mitigation                                                  |
| --------------------------------- | ----------------------------------------------------------- |
| Existing tokens become invalid    | Implement token format migration during first load         |
| simple-oauth2 version conflicts  | Pin to specific version, test thoroughly                   |
| Callback server port conflicts   | Implement dynamic port allocation with retry logic         |
| Browser launch failures          | Keep existing fallback to console URL display              |
| PKCE compatibility issues        | Verify simple-oauth2 v4.2.0 PKCE support before migration |
| Backward compatibility breaks    | Maintain existing token file format and storage locations  |

---

## Validation

### Automated Checks

```bash
# Type checking
bun run type-check

# Run OAuth-specific tests  
bun test packages/cli/tests/providers/mcp/auth.test.ts

# Run MCP integration tests
bun test packages/cli/tests/providers/mcp/

# Linting
bun run lint
```

### Manual Verification

1. **Token Storage**: Verify existing tokens in `~/.cia/mcp-tokens/` still load correctly
2. **OAuth Flow**: Test complete OAuth flow with test server (authorization → callback → token exchange)  
3. **Error Handling**: Verify proper error messages for missing config, network failures, invalid tokens
4. **CLI Commands**: Test `cia mcp auth <server-id>` command with actual OAuth configuration
5. **Integration**: Verify `cia mcp connect <server-id>` uses OAuth tokens when available

---

## Scope Boundaries

**IN SCOPE:**
- Replace custom OAuth implementation with simple-oauth2 library
- Maintain existing token storage format and location
- Update tests to work with new library
- Enable OAuth integration in MCP manager and CLI commands
- Preserve all current security features (PKCE, state validation)

**OUT OF SCOPE (do not touch):**
- Changes to MCP server configuration schema
- Alternative OAuth libraries evaluation
- Token encryption implementation (future enhancement)
- Multiple OAuth provider support
- Token sharing between different CIA instances

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-22T19:24:00Z  
- **Artifact**: `.claude/PRPs/issues/issue-54.md`