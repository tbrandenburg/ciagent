# Investigation: Replace custom networking/HTTP code with axios library

**Issue**: #57 (https://github.com/tbrandenburg/ciagent/issues/57)
**Type**: REFACTOR
**Investigated**: 2026-02-23T20:30:00Z

### Assessment

| Metric     | Value  | Reasoning                                                                                                                          |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Priority   | MEDIUM | Important for maintainability and reducing technical debt, but current networking code functions correctly and doesn't block user features |
| Complexity | HIGH   | Affects 5+ core files with multiple integration points (Vercel AI SDK providers, GitHub API, MCP reliability layer), requires careful coordination with existing retry systems |
| Confidence | HIGH   | Clear understanding of current implementation, well-defined axios patterns exist in industry, and exploration revealed all integration points clearly |

---

## Problem Statement

Custom networking code is scattered across multiple files with inconsistent implementations: manual proxy handling in vercel-factory.ts, custom retry logic in github-api.ts, and separate p-retry usage in reliability.ts. This creates maintainability issues and inconsistent error handling patterns.

---

## Analysis

### Change Rationale

**WHY**: Scattered custom networking implementations create maintenance overhead
↓ **BECAUSE**: Three different retry patterns exist across the codebase
Evidence: `packages/cli/src/providers/vercel-factory.ts:15-60` - Custom fetch with manual proxy env vars
Evidence: `packages/cli/src/utils/github-api.ts:280-355` - Custom fetchWithRetry implementation  
Evidence: `packages/cli/src/providers/reliability.ts:87-117` - p-retry with different patterns

↓ **BECAUSE**: Manual environment variable manipulation is fragile
Evidence: `packages/cli/src/providers/vercel-factory.ts:23-28` - Direct process.env modification
```typescript
if (httpProxy) process.env.HTTP_PROXY = httpProxy;
if (httpsProxy) process.env.HTTPS_PROXY = httpsProxy;
if (noProxy) process.env.NO_PROXY = noProxy;
```

↓ **BECAUSE**: Runtime-specific workarounds add complexity
Evidence: `packages/cli/src/providers/vercel-factory.ts:51-60` - Bun vs Node.js fetch handling

↓ **ROOT CAUSE**: No standardized HTTP client library to consolidate patterns
Evidence: `packages/cli/package.json:19-35` - No HTTP client dependency (only native fetch)

### Affected Files

| File                                              | Lines   | Action | Description                                    |
| ------------------------------------------------- | ------- | ------ | ---------------------------------------------- |
| `packages/cli/package.json`                      | 19-35   | UPDATE | Add axios dependency                           |
| `packages/cli/src/providers/vercel-factory.ts`   | 15-149  | UPDATE | Replace custom fetch with axios               |
| `packages/cli/src/utils/github-api.ts`           | 280-355 | UPDATE | Replace fetchWithRetry with axios interceptors |
| `packages/cli/src/shared/config/loader.ts`       | 96-114  | UPDATE | Simplify network config for axios patterns    |
| `packages/cli/tests/utils/github-api.test.ts`    | NEW     | CREATE | Update HTTP mocking to use axios              |
| `packages/cli/tests/providers/vercel-factory.test.ts` | NEW | CREATE | Update HTTP mocking to use axios         |

### Integration Points

- `packages/cli/src/providers/vercel-factory.ts:109,115,141,149` - Vercel AI SDK providers receive custom fetch function
- `packages/cli/src/context-processors.ts:296` - Calls GitHub API functions
- `packages/cli/src/providers/reliability.ts:87-117` - MCP providers use existing retry patterns
- Multiple test files mock HTTP calls via vi.spyOn patterns

### Git History

- **Introduced**: 04294bc - 2026-02-23 - "feat(network): add enterprise proxy and CA support"
- **Last modified**: 04294bc - recent commit
- **Implication**: Recently added custom networking, good time to standardize before it spreads further

---

## Implementation Plan

### Step 1: Add axios dependency

**File**: `packages/cli/package.json`
**Lines**: 19-35
**Action**: UPDATE

**Current code:**
```json
"dependencies": {
  "@ai-sdk/azure": "^3.0.30",
  "@ai-sdk/openai": "^3.0.30",
  "p-retry": "7.1.1"
}
```

**Required change:**
```json
"dependencies": {
  "@ai-sdk/azure": "^3.0.30", 
  "@ai-sdk/openai": "^3.0.30",
  "axios": "^1.7.0",
  "p-retry": "7.1.1"
}
```

**Why**: Add axios as primary HTTP client with robust proxy and interceptor support

---

### Step 2: Create axios HTTP client factory

**File**: `packages/cli/src/utils/http-client.ts`
**Action**: CREATE

**Required change:**
```typescript
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CIAConfig } from '../shared/config/types';
import { retry, RetryOptions } from '../providers/reliability';

export interface HttpClientConfig {
  timeout?: number;
  retries?: number;
  baseURL?: string;
}

export function createHttpClient(networkConfig?: CIAConfig['network'], clientConfig?: HttpClientConfig): AxiosInstance {
  const axiosConfig: AxiosRequestConfig = {
    timeout: clientConfig?.timeout || 30000,
    // Axios handles proxy configuration automatically from environment
    proxy: networkConfig?.['http-proxy'] ? {
      host: new URL(networkConfig['http-proxy']).hostname,
      port: parseInt(new URL(networkConfig['http-proxy']).port) || 8080,
      protocol: new URL(networkConfig['http-proxy']).protocol.slice(0, -1)
    } : false
  };

  const client = axios.create(axiosConfig);

  // Request interceptor for logging
  client.interceptors.request.use((config) => {
    // Add any common headers or logging
    return config;
  });

  // Response interceptor for retry logic
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (clientConfig?.retries && error.response?.status >= 500) {
        return retry(() => client.request(error.config), { 
          retries: clientConfig.retries 
        });
      }
      throw error;
    }
  );

  return client;
}
```

**Why**: Centralized HTTP client factory with consistent proxy and retry configuration

---

### Step 3: Update vercel-factory.ts to use axios

**File**: `packages/cli/src/providers/vercel-factory.ts`
**Lines**: 15-60, 97-149
**Action**: UPDATE

**Current code:**
```typescript
async function createNetworkFetch(network?: CIAConfig['network']): Promise<FetchFunction | undefined> {
  const { 'http-proxy': httpProxy, 'https-proxy': httpsProxy, 'no-proxy': noProxy } = network || {};
  
  if (httpProxy || httpsProxy || noProxy) {
    process.env.NODE_USE_ENV_PROXY = network['use-env-proxy'] === false ? '0' : '1';
    if (httpProxy) process.env.HTTP_PROXY = httpProxy;
    if (httpsProxy) process.env.HTTPS_PROXY = httpsProxy;
    if (noProxy) process.env.NO_PROXY = noProxy;
  }

  if (typeof Bun !== 'undefined') {
    return (url, init) => fetch(url, { ...init, proxy: bunProxy });
  }
}
```

**Required change:**
```typescript
import { createHttpClient } from '../utils/http-client';
import type { AxiosInstance } from 'axios';

async function createNetworkClient(network?: CIAConfig['network']): Promise<AxiosInstance> {
  return createHttpClient(network, { timeout: 30000, retries: 3 });
}

// Convert axios client to fetch-compatible function for AI SDK
function axiosToFetch(client: AxiosInstance): FetchFunction {
  return async (url: string | URL, init?: RequestInit) => {
    try {
      const response = await client.request({
        url: url.toString(),
        method: init?.method || 'GET',
        data: init?.body,
        headers: init?.headers as Record<string, string>
      });
      
      return new Response(JSON.stringify(response.data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as HeadersInit
      });
    } catch (error) {
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  };
}
```

**Why**: Replace manual proxy handling with axios configuration, eliminate runtime-specific workarounds

---

### Step 4: Update github-api.ts to use axios

**File**: `packages/cli/src/utils/github-api.ts`
**Lines**: 280-355
**Action**: UPDATE

**Current code:**
```typescript
async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
        let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      // Custom error handling
    }
  }
}
```

**Required change:**
```typescript
import { createHttpClient } from './http-client';
import type { AxiosInstance, AxiosResponse } from 'axios';

const githubClient: AxiosInstance = createHttpClient(undefined, { 
  baseURL: 'https://api.github.com',
  timeout: 30000,
  retries: 3 
});

// GitHub-specific rate limit handling
githubClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403) {
      const rateLimitRemaining = error.response.headers['x-ratelimit-remaining'];
      if (rateLimitRemaining === '0') {
        const resetTime = error.response.headers['x-ratelimit-reset'];
        const delay = (parseInt(resetTime) * 1000) - Date.now();
        await new Promise(resolve => setTimeout(resolve, Math.max(delay, 1000)));
        return githubClient.request(error.config);
      }
    }
    throw error;
  }
);

export async function fetchGitHubData(endpoint: string, token?: string): Promise<any> {
  const response: AxiosResponse = await githubClient.get(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return response.data;
}
```

**Why**: Replace custom retry logic with axios interceptors, maintain GitHub-specific rate limit handling

---

### Step 5: Update configuration types and validation

**File**: `packages/cli/src/shared/config/loader.ts`
**Lines**: 96-114
**Action**: UPDATE

**Current code:**
```typescript
network: z.object({
  'http-proxy': z.string().url().optional(),
  'https-proxy': z.string().url().optional(), 
  'no-proxy': z.string().optional(),
  'use-env-proxy': z.boolean().default(true).optional(),
}).optional()
```

**Required change:**
```typescript
network: z.object({
  'http-proxy': z.string().url().optional(),
  'https-proxy': z.string().url().optional(),
  'no-proxy': z.string().optional(),
  'timeout': z.number().min(1000).max(300000).default(30000).optional(),
  'retries': z.number().min(0).max(10).default(3).optional(),
}).optional()
```

**Why**: Remove 'use-env-proxy' (axios handles automatically), add timeout/retry configuration options

---

### Step 6: Update test patterns to use axios mocking

**File**: `packages/cli/tests/utils/github-api.test.ts`
**Action**: CREATE

**Test cases to add:**
```typescript
import { vi } from 'vitest';
import axios from 'axios';
import { fetchGitHubData } from '../../../src/utils/github-api';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('GitHub API with axios', () => {
  it('should fetch repository data successfully', async () => {
    const mockData = { id: 123, name: 'test-repo' };
    mockedAxios.get.mockResolvedValue({ data: mockData });

    const result = await fetchGitHubData('/repos/owner/repo');
    expect(result).toEqual(mockData);
    expect(mockedAxios.get).toHaveBeenCalledWith('/repos/owner/repo', {
      headers: {}
    });
  });

  it('should handle rate limit with retry', async () => {
    const rateLimitError = {
      response: { 
        status: 403, 
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60) }
      }
    };
    
    mockedAxios.get
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue({ data: { success: true } });

    // Should eventually succeed after rate limit delay
    const result = await fetchGitHubData('/test');
    expect(result).toEqual({ success: true });
  });
});
```

---

## Patterns to Follow

**From codebase - mirror these exactly:**

```typescript
// SOURCE: packages/cli/src/providers/reliability.ts:87-117
// Pattern for error handling with p-retry integration
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  return pRetry(async () => {
    try {
      return await fn();
    } catch (error) {
      if (!retryIf(error)) {
        throw new AbortError(errorMsg);
      }
      throw error;
    }
  }, { retries: attempts - 1, factor, minTimeout: delay });
}
```

```typescript
// SOURCE: packages/cli/tests/context/context-processors.test.ts:283-297
// Pattern for mocking external API calls in tests
const fetchGitHubMetadataSpy = vi
  .spyOn(githubApi, 'fetchGitHubMetadata')
  .mockResolvedValue(mockPRData);
```

---

## Edge Cases & Risks

| Risk/Edge Case                           | Mitigation                                                      |
| ---------------------------------------- | --------------------------------------------------------------- |
| Vercel AI SDK compatibility with axios  | Create fetch adapter function to maintain SDK interface        |
| Corporate proxy certificate validation  | Use axios CA bundle configuration, test with corporate proxies |
| Bun runtime axios compatibility          | Test axios with Bun, use fetch adapter if needed              |
| Existing retry logic conflicts           | Integrate with existing p-retry patterns from reliability.ts   |
| Breaking changes in HTTP error handling | Maintain same error types and messages for backward compatibility |

---

## Validation

### Automated Checks

```bash
bun run type-check    # TypeScript validation
bun test packages/cli/tests/utils/github-api.test.ts
bun test packages/cli/tests/providers/vercel-factory.test.ts
bun run lint         # ESLint validation
```

### Manual Verification

1. Test HTTP requests work with corporate proxy configuration
2. Verify GitHub API calls handle rate limiting correctly
3. Test Vercel AI SDK providers still receive working fetch function
4. Confirm retry behavior matches previous implementation
5. Test error messages and types remain consistent

---

## Scope Boundaries

**IN SCOPE:**
- Replace custom networking in vercel-factory.ts and github-api.ts with axios
- Consolidate proxy configuration patterns
- Update HTTP mocking in tests to use axios
- Add axios dependency to package.json

**OUT OF SCOPE (do not touch):**
- MCP reliability layer p-retry patterns (keep existing implementation)
- WebSocket or non-HTTP networking code
- AI SDK provider implementations beyond networking layer
- Configuration file formats or environment variable names

---

## Metadata

- **Investigated by**: Claude
- **Timestamp**: 2026-02-23T20:30:00Z
- **Artifact**: `.claude/PRPs/issues/issue-57.md`