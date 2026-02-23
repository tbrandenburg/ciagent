# Investigation: Complete axios networking implementation: missing no-proxy and HTTPS proxy support

**Issue**: #63 (https://github.com/tbrandenburg/ciagent/issues/63)
**Type**: ENHANCEMENT
**Investigated**: 2026-02-23T11:40:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                           |
| ---------- | ------ | --------------------------------------------------------------------------------------------------- |
| Priority   | HIGH   | Affects production deployments in corporate environments - enterprise users cannot use the tool    |
| Complexity | MEDIUM | Affects 4-5 files with some integration points but well-understood scope based on existing patterns |
| Confidence | HIGH   | Clear evidence from code exploration, well-defined requirements, existing patterns to follow       |

---

## Problem Statement

The axios networking implementation introduced in issue #57 is incomplete, missing critical enterprise networking features: no-proxy list support and HTTPS proxy configuration. This prevents the tool from working in corporate environments with proxy configurations.

---

## Analysis

### Root Cause / Change Rationale

The issue stems from an incomplete migration during issue #57. The commit 2b56ff0 successfully replaced custom networking with axios but focused on the core functionality without implementing all the advanced proxy features that were present or planned in the original design.

### Evidence Chain

**ISSUE**: No-proxy and HTTPS proxy support missing in production environments
↓ **BECAUSE**: The axios implementation only configures HTTP proxy
**Evidence**: `packages/cli/src/utils/http-client.ts:18-24` - Only `http-proxy` configured:
```typescript
proxy: networkConfig?.['http-proxy']
  ? {
      host: new URL(networkConfig['http-proxy']).hostname,
      port: parseInt(new URL(networkConfig['http-proxy']).port) || 8080,
      protocol: new URL(networkConfig['http-proxy']).protocol.slice(0, -1),
    }
  : false,
```

↓ **BECAUSE**: Configuration schema exists but is not fully utilized
**Evidence**: `packages/cli/src/shared/config/loader.ts:32-39` - Schema defines but doesn't implement:
```typescript
'https-proxy'?: string;  // DEFINED BUT NOT IMPLEMENTED
'no-proxy'?: string[];   // DEFINED BUT NOT IMPLEMENTED
```

↓ **ROOT CAUSE**: Incomplete proxy configuration logic in axios setup
**Evidence**: `packages/cli/src/utils/http-client.ts:18-24` - Manual proxy construction ignores https-proxy and no-proxy

### Affected Files

| File                                              | Lines  | Action | Description                          |
| ------------------------------------------------- | ------ | ------ | ------------------------------------ |
| `packages/cli/src/utils/http-client.ts`           | 15-25  | UPDATE | Complete proxy configuration logic   |
| `packages/cli/src/providers/vercel-factory.ts`    | 61-62  | UPDATE | Apply HTTPS proxy to AI SDK fetch    |
| `packages/cli/tests/utils/http-client.test.ts`    | NEW    | CREATE | Test proxy configuration behavior    |
| `packages/cli/tests/integration/proxy.test.ts`    | NEW    | CREATE | Integration tests for proxy features |
| `packages/cli/src/shared/validation/validation.ts` | 137-184| UPDATE | Enhanced proxy validation            |

### Integration Points

- `packages/cli/src/utils/github-api.ts:245-249` calls `createHttpClient`
- `packages/cli/src/providers/vercel-factory.ts:20-22` uses HTTP client for network requests
- `packages/cli/src/shared/config/loader.ts:97-113` loads environment variables including NO_PROXY
- Configuration validation in `packages/cli/src/shared/validation/validation.ts:134-208`

### Git History

- **Introduced**: 2b56ff0 - 2026-02-23 - "Fix: Replace custom networking/HTTP code with axios library (#57)"
- **Last modified**: Same commit (recent change)
- **Implication**: Fresh implementation that was incomplete from the start, not a regression

---

## Implementation Plan

### Step 1: Complete proxy configuration in HTTP client

**File**: `packages/cli/src/utils/http-client.ts`
**Lines**: 15-25
**Action**: UPDATE

**Current code:**

```typescript
// Lines 15-25
const axiosConfig: AxiosRequestConfig = {
  timeout: clientConfig?.timeout || 30000,
  // Axios handles proxy configuration automatically from environment
  proxy: networkConfig?.['http-proxy']
    ? {
        host: new URL(networkConfig['http-proxy']).hostname,
        port: parseInt(new URL(networkConfig['http-proxy']).port) || 8080,
        protocol: new URL(networkConfig['http-proxy']).protocol.slice(0, -1),
      }
    : false,
};
```

**Required change:**

```typescript
const axiosConfig: AxiosRequestConfig = {
  timeout: clientConfig?.timeout || 30000,
  // Complete proxy configuration with no-proxy support
  proxy: createProxyConfig(networkConfig),
};

// Add helper function for proxy configuration
function createProxyConfig(networkConfig?: NetworkConfig) {
  if (!networkConfig) return false;
  
  const httpProxy = networkConfig['http-proxy'];
  const httpsProxy = networkConfig['https-proxy'];
  const noProxy = networkConfig['no-proxy'];
  
  // If no proxies configured, return false
  if (!httpProxy && !httpsProxy) return false;
  
  return {
    http: httpProxy ? parseProxyUrl(httpProxy) : undefined,
    https: httpsProxy ? parseProxyUrl(httpsProxy) : undefined,
    noProxy: noProxy || [],
  };
}

function parseProxyUrl(proxyUrl: string) {
  const url = new URL(proxyUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 8080),
    protocol: url.protocol.slice(0, -1),
    auth: url.username && url.password ? {
      username: url.username,
      password: url.password,
    } : undefined,
  };
}
```

**Why**: Axios supports separate HTTP/HTTPS proxy configuration and no-proxy lists through its proxy configuration

---

### Step 2: Update Vercel factory HTTPS proxy support

**File**: `packages/cli/src/providers/vercel-factory.ts`
**Lines**: 61-62, 100, 112, 118
**Action**: UPDATE

**Current code:**

```typescript
// Lines 61-62
const networkFetch = createNetworkFetch({
  caPath: networkConfig?.['ca-bundle-path'],
});
```

**Required change:**

```typescript
const networkFetch = createNetworkFetch({
  caPath: networkConfig?.['ca-bundle-path'],
  proxy: networkConfig ? {
    http: networkConfig['http-proxy'],
    https: networkConfig['https-proxy'],
    noProxy: networkConfig['no-proxy'],
  } : undefined,
});

// Update createNetworkFetch to handle proxy configuration
function createNetworkFetch(options: { caPath?: string; proxy?: ProxyConfig }) {
  return async (url: string, init?: RequestInit) => {
    // Apply proxy configuration to fetch
    if (options.proxy) {
      // Set proxy environment variables for the AI SDK fetch calls
      const targetUrl = new URL(url);
      const shouldUseProxy = !shouldBypassProxy(targetUrl.hostname, options.proxy.noProxy);
      
      if (shouldUseProxy) {
        const proxyUrl = targetUrl.protocol === 'https:' ? options.proxy.https : options.proxy.http;
        if (proxyUrl) {
          // Configure proxy for this specific request
          process.env.HTTPS_PROXY = targetUrl.protocol === 'https:' ? proxyUrl : process.env.HTTPS_PROXY;
          process.env.HTTP_PROXY = targetUrl.protocol === 'http:' ? proxyUrl : process.env.HTTP_PROXY;
        }
      }
    }
    
    // Existing CA bundle logic...
  };
}
```

**Why**: AI SDK uses fetch, which respects proxy environment variables

---

### Step 3: Add comprehensive proxy configuration tests

**File**: `packages/cli/tests/utils/http-client.test.ts`
**Action**: CREATE

**Test cases to add:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHttpClient } from '../../src/utils/http-client';

describe('HTTP Client Proxy Configuration', () => {
  it('should configure HTTP proxy correctly', () => {
    const client = createHttpClient({}, {
      'http-proxy': 'http://proxy.company.com:8080'
    });
    
    expect(client.defaults.proxy).toEqual({
      http: {
        host: 'proxy.company.com',
        port: 8080,
        protocol: 'http'
      }
    });
  });

  it('should configure HTTPS proxy correctly', () => {
    const client = createHttpClient({}, {
      'https-proxy': 'https://secure-proxy.company.com:8443'
    });
    
    expect(client.defaults.proxy.https).toEqual({
      host: 'secure-proxy.company.com',
      port: 8443,
      protocol: 'https'
    });
  });

  it('should handle no-proxy list', () => {
    const client = createHttpClient({}, {
      'http-proxy': 'http://proxy.company.com:8080',
      'no-proxy': ['localhost', '*.internal.com', '192.168.*']
    });
    
    expect(client.defaults.proxy.noProxy).toEqual(['localhost', '*.internal.com', '192.168.*']);
  });

  it('should handle proxy authentication', () => {
    const client = createHttpClient({}, {
      'http-proxy': 'http://user:pass@proxy.company.com:8080'
    });
    
    expect(client.defaults.proxy.http.auth).toEqual({
      username: 'user',
      password: 'pass'
    });
  });
});
```

---

### Step 4: Add integration tests for proxy behavior

**File**: `packages/cli/tests/integration/proxy.test.ts`
**Action**: CREATE

**Test cases to add:**

```typescript
import { describe, it, expect } from 'vitest';
import { createHttpClient } from '../../src/utils/http-client';

describe('Proxy Integration Tests', () => {
  it('should bypass proxy for no-proxy domains', async () => {
    // Test actual HTTP behavior with mock proxy server
    const client = createHttpClient({}, {
      'http-proxy': 'http://mock-proxy:8080',
      'no-proxy': ['localhost']
    });
    
    // Verify localhost requests bypass proxy
    // This would require setting up a test HTTP server
  });

  it('should use HTTPS proxy for HTTPS requests', async () => {
    const client = createHttpClient({}, {
      'https-proxy': 'https://https-proxy:8443'
    });
    
    // Verify HTTPS requests use HTTPS proxy
  });
});
```

---

### Step 5: Enhanced proxy URL validation

**File**: `packages/cli/src/shared/validation/validation.ts`
**Lines**: 137-184
**Action**: UPDATE

**Current code:**

```typescript
// Lines 137-141 
if (network['http-proxy']) {
  try {
    new URL(network['http-proxy']);
  } catch {
    errors.push('network.http-proxy must be a valid URL');
  }
}
```

**Required change:**

```typescript
if (network['http-proxy']) {
  try {
    const url = new URL(network['http-proxy']);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push('network.http-proxy must use http: or https: protocol');
    }
  } catch {
    errors.push('network.http-proxy must be a valid URL');
  }
}

if (network['https-proxy']) {
  try {
    const url = new URL(network['https-proxy']);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push('network.https-proxy must use http: or https: protocol');
    }
  } catch {
    errors.push('network.https-proxy must be a valid URL');
  }
}

// Enhanced no-proxy validation
if (network['no-proxy']) {
  for (const pattern of network['no-proxy']) {
    if (typeof pattern !== 'string' || pattern.trim() === '') {
      errors.push('network.no-proxy entries must be non-empty strings');
    }
  }
}
```

**Why**: Prevent crashes from malformed proxy URLs and ensure proper protocol usage

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/shared/config/loader.ts:97-113
// Pattern for environment variable parsing with NO_PROXY
const noProxyEnv = process.env.NO_PROXY || process.env.no_proxy;
const noProxyList = noProxyEnv 
  ? noProxyEnv.split(',').map(item => item.trim()).filter(Boolean)
  : undefined;
```

```typescript
// SOURCE: packages/cli/src/utils/github-api.ts:245-249
// Pattern for HTTP client creation with config
export async function fetchGitHubData(apiUrl: string, token: string, networkConfig?: NetworkConfig) {
  const client = createHttpClient({ retries: 3 }, networkConfig);
  // ... rest of implementation
}
```

```typescript
// SOURCE: packages/cli/src/shared/validation/validation.ts:176-184
// Pattern for CA bundle validation
if (network['ca-bundle-path']) {
  if (typeof network['ca-bundle-path'] !== 'string') {
    errors.push('network.ca-bundle-path must be a string');
  } else if (!fs.existsSync(network['ca-bundle-path'])) {
    errors.push(`network.ca-bundle-path file does not exist: ${network['ca-bundle-path']}`);
  }
}
```

---

## Edge Cases & Risks

| Risk/Edge Case                      | Mitigation                                           |
| ----------------------------------- | ---------------------------------------------------- |
| Malformed proxy URLs crash app     | Enhanced validation in validation.ts                |
| Auth credentials in URLs           | Proper URL parsing to extract username/password     |
| No-proxy pattern matching failure  | Use standard glob pattern matching library          |
| HTTPS proxy for HTTP requests      | Clear protocol-specific proxy configuration         |
| Environment variable conflicts     | Prioritize config file over env vars                |
| Proxy connection timeouts          | Use existing timeout configuration from clientConfig |

---

## Validation

### Automated Checks

```bash
bun run type-check
bun test packages/cli/tests/utils/http-client.test.ts
bun test packages/cli/tests/integration/proxy.test.ts
bun run lint
```

### Manual Verification

1. Configure HTTP proxy in config file, verify GitHub API calls use proxy
2. Configure HTTPS proxy, verify Vercel/Claude API calls use HTTPS proxy  
3. Set no-proxy list with localhost, verify local requests bypass proxy
4. Test with proxy authentication URLs
5. Verify malformed proxy URLs are rejected with clear error messages

---

## Scope Boundaries

**IN SCOPE:**

- Complete axios proxy configuration (HTTP/HTTPS/no-proxy)
- Enhanced proxy URL validation
- Proxy integration in Vercel factory for AI SDK
- Comprehensive test coverage for proxy features
- Error handling for proxy connection failures

**OUT OF SCOPE (do not touch):**

- Custom proxy authentication methods beyond URL-based
- Proxy auto-discovery (PAC files)
- SOCKS proxy support
- Changing the core axios retry/timeout logic (already works)
- Modifying existing error handling patterns outside proxy scope

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-23T11:40:00Z
- **Artifact**: `.claude/PRPs/issues/issue-63.md`