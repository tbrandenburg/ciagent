/**
 * GitHub API integration utilities
 *
 * Provides functions for:
 * - GitHub URL parsing and validation
 * - PR/Issue metadata fetching with rate limiting
 * - SSRF prevention and security validation
 * - Exponential backoff for rate limiting
 */

/**
 * Parsed GitHub URL interface
 */
export interface GitHubUrlParts {
  org: string;
  repo: string;
  number: number;
  type: 'pull' | 'issue';
}

/**
 * GitHub PR metadata interface
 */
export interface GitHubPRMetadata {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  created_at: string;
  updated_at: string;
  url: string;
  head_ref: string;
  base_ref: string;
}

/**
 * GitHub Issue metadata interface
 */
export interface GitHubIssueMetadata {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  author: string;
  created_at: string;
  updated_at: string;
  url: string;
  labels: string[];
}

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
}

const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Parse GitHub URL to extract organization, repository, and number
 * @param url GitHub URL (PR or issue)
 * @returns Parsed URL parts or null if invalid
 */
export function parseGitHubUrl(url: string): GitHubUrlParts | null {
  try {
    // Validate URL format first
    if (!validateGitHubUrl(url)) {
      return null;
    }

    const urlObj = new URL(url);

    // Check if it's a GitHub domain
    if (!urlObj.hostname.match(/^(www\.)?github\.com$/)) {
      return null;
    }

    // Parse path: /{org}/{repo}/{type}/{number}
    const pathParts = urlObj.pathname.split('/').filter(part => part);

    if (pathParts.length < 4) {
      return null;
    }

    const [org, repo, type, numberStr] = pathParts;

    // Validate type
    if (type !== 'pull' && type !== 'issues') {
      return null;
    }

    // Parse number
    const number = parseInt(numberStr, 10);
    if (isNaN(number) || number <= 0) {
      return null;
    }

    return {
      org,
      repo,
      number,
      type: type === 'pull' ? 'pull' : 'issue',
    };
  } catch (error) {
    return null;
  }
}

/**
 * Validate GitHub URL for SSRF prevention and format checking
 * @param url URL to validate
 * @returns True if URL is safe and valid
 */
export function validateGitHubUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return false;
    }

    // Only allow github.com domain
    if (!urlObj.hostname.match(/^(www\.)?github\.com$/)) {
      return false;
    }

    // Check for suspicious patterns that could indicate SSRF attempts
    const suspiciousPatterns = [
      /localhost/i,
      /127\.0\.0\.1/,
      /0\.0\.0\.0/,
      /192\.168\./,
      /10\./,
      /172\.(1[6-9]|2[0-9]|3[01])\./,
      /@/, // Prevent user:pass@host patterns
      /%/, // Prevent URL encoding tricks
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(url))) {
      return false;
    }

    // Validate path format
    const pathParts = urlObj.pathname.split('/').filter(part => part);
    if (pathParts.length < 4) {
      return false;
    }

    const [org, repo, type, numberStr] = pathParts;

    // Validate org/repo names (GitHub username/repo name rules)
    const validNamePattern = /^[a-zA-Z0-9]([a-zA-Z0-9]|-(?!-))*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
    if (!validNamePattern.test(org) || !validNamePattern.test(repo)) {
      return false;
    }

    // Validate type
    if (type !== 'pull' && type !== 'issues') {
      return false;
    }

    // Validate number
    const number = parseInt(numberStr, 10);
    if (isNaN(number) || number <= 0 || number > 999999) {
      // Reasonable upper bound
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Fetch PR metadata from GitHub API with rate limiting
 * @param org Organization name
 * @param repo Repository name
 * @param number PR number
 * @param token Optional GitHub token for authentication
 * @returns PR metadata
 */
export async function fetchPRMetadata(
  org: string,
  repo: string,
  number: number,
  token?: string
): Promise<GitHubPRMetadata> {
  const url = `https://api.github.com/repos/${org}/${repo}/pulls/${number}`;

  const response = await fetchWithRetry(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'ciagent-cli/0.1.0',
      ...(token && { Authorization: `token ${token}` }),
    },
  });

  const data = (await response.json()) as any; // GitHub API response

  return {
    id: data.id,
    number: data.number,
    title: data.title,
    body: data.body || '',
    state: data.merged ? 'merged' : data.state,
    author: data.user?.login || 'unknown',
    created_at: data.created_at,
    updated_at: data.updated_at,
    url: data.html_url,
    head_ref: data.head?.ref || '',
    base_ref: data.base?.ref || '',
  };
}

/**
 * Fetch Issue metadata from GitHub API with rate limiting
 * @param org Organization name
 * @param repo Repository name
 * @param number Issue number
 * @param token Optional GitHub token for authentication
 * @returns Issue metadata
 */
export async function fetchIssueMetadata(
  org: string,
  repo: string,
  number: number,
  token?: string
): Promise<GitHubIssueMetadata> {
  const url = `https://api.github.com/repos/${org}/${repo}/issues/${number}`;

  const response = await fetchWithRetry(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'ciagent-cli/0.1.0',
      ...(token && { Authorization: `token ${token}` }),
    },
  });

  const data = (await response.json()) as any; // GitHub API response

  // Note: PRs are also returned by the issues API, so we need to check
  if (data.pull_request) {
    throw new Error(`Issue ${number} is actually a pull request. Use fetchPRMetadata instead.`);
  }

  return {
    id: data.id,
    number: data.number,
    title: data.title,
    body: data.body || '',
    state: data.state,
    author: data.user?.login || 'unknown',
    created_at: data.created_at,
    updated_at: data.updated_at,
    url: data.html_url,
    labels: data.labels?.map((label: any) => label.name) || [],
  };
}

/**
 * Fetch with exponential backoff retry logic for rate limiting
 * @param url URL to fetch
 * @param options Fetch options
 * @param config Rate limiting configuration
 * @returns Response object
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Handle rate limiting (GitHub returns 403 for rate limits)
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
        const rateLimitReset = response.headers.get('x-ratelimit-reset');

        if (rateLimitRemaining === '0') {
          if (attempt < config.maxRetries) {
            // Calculate delay based on reset time or exponential backoff
            let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);

            if (rateLimitReset) {
              const resetTime = parseInt(rateLimitReset, 10) * 1000;
              const now = Date.now();
              const timeUntilReset = Math.max(0, resetTime - now);

              // Use the smaller of exponential backoff or time until reset + buffer
              delay = Math.min(delay, timeUntilReset + 5000);
            }

            delay = Math.min(delay, config.maxDelay);

            console.error(
              `GitHub API rate limit exceeded. Retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries + 1})`
            );
            await sleep(delay);
            continue;
          }
        }
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API error ${response.status}: ${errorText}`);
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on certain errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network error - might be worth retrying
      } else if (lastError.message.includes('GitHub API error 4')) {
        // 4xx errors (except rate limiting) shouldn't be retried
        throw lastError;
      }

      if (attempt < config.maxRetries) {
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        );

        console.error(
          `Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries + 1}): ${lastError.message}`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Sleep utility function
 * @param ms Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get GitHub token from environment or config
 * Looks for GITHUB_TOKEN env var first, then falls back to other common names
 * @returns GitHub token or undefined
 */
export function getGitHubToken(): string | undefined {
  return (
    process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_ACCESS_TOKEN || undefined
  );
}

/**
 * Fetch GitHub metadata with automatic type detection
 * @param url GitHub URL (PR or issue)
 * @param token Optional GitHub token
 * @returns PR or Issue metadata
 */
export async function fetchGitHubMetadata(
  url: string,
  token?: string
): Promise<GitHubPRMetadata | GitHubIssueMetadata> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }

  const authToken = token || getGitHubToken();

  if (parsed.type === 'pull') {
    return fetchPRMetadata(parsed.org, parsed.repo, parsed.number, authToken);
  } else {
    return fetchIssueMetadata(parsed.org, parsed.repo, parsed.number, authToken);
  }
}
