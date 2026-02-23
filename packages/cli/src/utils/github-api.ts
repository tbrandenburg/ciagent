/**
 * GitHub API integration utilities
 *
 * Provides functions for:
 * - GitHub URL parsing and validation
 * - PR/Issue metadata fetching with rate limiting
 * - SSRF prevention and security validation
 * - Exponential backoff for rate limiting
 */

import { createHttpClient } from './http-client';
import type { AxiosInstance, AxiosResponse } from 'axios';
import type { CIAConfig } from '../shared/config/loader';

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
  const endpoint = `/repos/${org}/${repo}/pulls/${number}`;
  const data = await fetchGitHubData(endpoint, token);

  return {
    id: data.id,
    number: data.number,
    title: data.title,
    body: data.body || '',
    state: data.merged ? 'merged' : data.state,
    author: data.user?.login || 'unknown',
    head_ref: data.head?.ref || '',
    base_ref: data.base?.ref || '',
    created_at: data.created_at,
    updated_at: data.updated_at,
    url: data.html_url,
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
  const endpoint = `/repos/${org}/${repo}/issues/${number}`;
  const data = await fetchGitHubData(endpoint, token);

  // Note: PRs are also returned by the issues API, so we need to check
  if (data.pull_request) {
    throw new Error('This is a pull request, not an issue. Use fetchPRMetadata instead.');
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
 * Create GitHub-specific HTTP client with rate limiting
 */
export function createGitHubClient(networkConfig?: CIAConfig['network']): AxiosInstance {
  const client = createHttpClient(networkConfig, {
    baseURL: 'https://api.github.com',
    timeout: 30000,
    retries: 3,
  });

  // GitHub-specific rate limit handling
  client.interceptors.response.use(
    response => response,
    async error => {
      if (error.response?.status === 403) {
        const rateLimitRemaining = error.response.headers['x-ratelimit-remaining'];
        if (rateLimitRemaining === '0') {
          const resetTime = error.response.headers['x-ratelimit-reset'];
          const delay = parseInt(resetTime) * 1000 - Date.now();
          if (delay > 0 && delay < 60000) {
            // Only wait up to 1 minute
            await new Promise(resolve => setTimeout(resolve, delay));
            return client.request(error.config);
          }
        }
      }
      throw error;
    }
  );

  return client;
}

// Default client for backward compatibility
const githubClient: AxiosInstance = createGitHubClient();

/**
 * Fetch GitHub data using axios client
 */
export async function fetchGitHubData(endpoint: string, token?: string): Promise<any> {
  const response: AxiosResponse = await githubClient.get(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.data;
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
