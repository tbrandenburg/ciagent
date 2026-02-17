/**
 * OAuth 2.1 Authentication for Remote MCP Servers
 * Implements PKCE flow with secure token storage
 * Adapted from OpenCode's OAuth implementation
 */

import { randomBytes, createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import open from 'open';
import { discoverOAuthMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
import type { MCPRemoteServerConfig } from '../../shared/config/schema.js';

// OAuth types based on SDK schemas
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface OAuthClientMetadata {
  redirect_uris: string[];
  client_name?: string;
  client_uri?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

export interface OAuthClientInformation {
  client_id: string;
  client_secret?: string;
}

// PKCE helper functions
function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Simple file-based token storage for development
 * In production, this should use encrypted storage
 */
class TokenStorage {
  private tokenDir: string;

  constructor() {
    this.tokenDir = path.join(os.homedir(), '.cia', 'mcp-tokens');
    if (!fs.existsSync(this.tokenDir)) {
      fs.mkdirSync(this.tokenDir, { recursive: true });
    }
  }

  private getTokenPath(serverId: string): string {
    return path.join(this.tokenDir, `${serverId}.json`);
  }

  setTokens(serverId: string, tokens: OAuthTokens): void {
    const tokenPath = this.getTokenPath(serverId);
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
  }

  getTokens(serverId: string): OAuthTokens | undefined {
    const tokenPath = this.getTokenPath(serverId);
    if (!fs.existsSync(tokenPath)) {
      return undefined;
    }

    try {
      const content = fs.readFileSync(tokenPath, 'utf8');
      return JSON.parse(content) as OAuthTokens;
    } catch {
      return undefined;
    }
  }

  clearTokens(serverId: string): void {
    const tokenPath = this.getTokenPath(serverId);
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  }

  hasValidTokens(serverId: string): boolean {
    const tokens = this.getTokens(serverId);
    if (!tokens || !tokens.access_token) {
      return false;
    }

    // Check if tokens are expired (if expires_in is provided)
    if (tokens.expires_in) {
      // This is a simplified check - in practice, you'd want to store the issued_at timestamp
      // For now, we'll assume tokens are valid if they exist
      return true;
    }

    return true;
  }
}

const DEFAULT_CALLBACK_PORT = 19876;
const DEFAULT_CALLBACK_PATH = '/mcp/oauth/callback';

/**
 * OAuth 2.1 PKCE provider for MCP servers
 */
export class McpOAuthProvider {
  private tokenStorage: TokenStorage;
  private callbackPort: number;
  private callbackPath: string;

  constructor(
    private serverId: string,
    private serverUrl: string,
    private config: MCPRemoteServerConfig,
    options: { callbackPort?: number; callbackPath?: string } = {}
  ) {
    this.tokenStorage = new TokenStorage();
    this.callbackPort = options.callbackPort || DEFAULT_CALLBACK_PORT;
    this.callbackPath = options.callbackPath || DEFAULT_CALLBACK_PATH;
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.callbackPort}${this.callbackPath}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: 'CIA Agent',
      client_uri: 'https://github.com/tbrandenburg/ciagent',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method:
        this.config.oauth && typeof this.config.oauth === 'object' && this.config.oauth.clientSecret
          ? 'client_secret_post'
          : 'none',
    };
  }

  async hasValidTokens(): Promise<boolean> {
    return this.tokenStorage.hasValidTokens(this.serverId);
  }

  async getStoredTokens(): Promise<OAuthTokens | undefined> {
    return this.tokenStorage.getTokens(this.serverId);
  }

  /**
   * Start OAuth 2.1 PKCE authorization flow
   */
  async startAuthorizationFlow(): Promise<{ authUrl: string; state: string }> {
    if (!this.config.oauth || typeof this.config.oauth !== 'object') {
      throw new Error(`OAuth configuration required for server ${this.serverId}`);
    }

    const { clientId, scope } = this.config.oauth;
    if (!clientId) {
      throw new Error(`OAuth clientId required for server ${this.serverId}`);
    }

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store PKCE parameters temporarily (in production, use secure storage)
    const tempStorage = {
      codeVerifier,
      state,
      timestamp: Date.now(),
    };

    const tempPath = path.join(os.tmpdir(), `mcp-pkce-${this.serverId}.json`);
    fs.writeFileSync(tempPath, JSON.stringify(tempStorage));

    try {
      // Discover OAuth metadata
      const metadata = await discoverOAuthMetadata(new URL(this.serverUrl));

      if (!metadata || !metadata.authorization_endpoint) {
        throw new Error(`No authorization endpoint found for server ${this.serverId}`);
      }

      // Build authorization URL
      const authUrl = new URL(metadata.authorization_endpoint);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', this.redirectUrl);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);

      if (scope) {
        authUrl.searchParams.set('scope', scope);
      }

      return {
        authUrl: authUrl.toString(),
        state,
      };
    } catch (error) {
      // Clean up temporary storage on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * Handle OAuth callback and exchange authorization code for tokens
   */
  async handleCallback(code: string, state: string): Promise<OAuthTokens> {
    const tempPath = path.join(os.tmpdir(), `mcp-pkce-${this.serverId}.json`);

    if (!fs.existsSync(tempPath)) {
      throw new Error('OAuth flow not initiated or expired');
    }

    const tempStorage = JSON.parse(fs.readFileSync(tempPath, 'utf8'));

    // Validate state parameter (CSRF protection)
    if (tempStorage.state !== state) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    // Check if flow is not too old (10 minutes max)
    if (Date.now() - tempStorage.timestamp > 10 * 60 * 1000) {
      throw new Error('OAuth flow expired');
    }

    try {
      if (!this.config.oauth || typeof this.config.oauth !== 'object') {
        throw new Error(`OAuth configuration required for server ${this.serverId}`);
      }

      const { clientId, clientSecret } = this.config.oauth;

      // Discover OAuth metadata for token endpoint
      const metadata = await discoverOAuthMetadata(new URL(this.serverUrl));

      if (!metadata || !metadata.token_endpoint) {
        throw new Error(`No token endpoint found for server ${this.serverId}`);
      }

      // Exchange authorization code for tokens
      const tokenResponse = await fetch(metadata.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUrl,
          code_verifier: tempStorage.codeVerifier,
          client_id: clientId,
          ...(clientSecret && { client_secret: clientSecret }),
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
      }

      const tokens = (await tokenResponse.json()) as OAuthTokens;

      // Store tokens
      this.tokenStorage.setTokens(this.serverId, tokens);

      return tokens;
    } finally {
      // Clean up temporary storage
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }

  /**
   * Refresh access tokens using refresh token
   */
  async refreshTokens(): Promise<OAuthTokens> {
    const currentTokens = this.tokenStorage.getTokens(this.serverId);

    if (!currentTokens || !currentTokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    if (!this.config.oauth || typeof this.config.oauth !== 'object') {
      throw new Error(`OAuth configuration required for server ${this.serverId}`);
    }

    const { clientId, clientSecret } = this.config.oauth;

    // Discover OAuth metadata for token endpoint
    const metadata = await discoverOAuthMetadata(new URL(this.serverUrl));

    if (!metadata || !metadata.token_endpoint) {
      throw new Error(`No token endpoint found for server ${this.serverId}`);
    }

    const tokenResponse = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentTokens.refresh_token,
        client_id: clientId,
        ...(clientSecret && { client_secret: clientSecret }),
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token refresh failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokens = (await tokenResponse.json()) as OAuthTokens;

    // Store refreshed tokens
    this.tokenStorage.setTokens(this.serverId, tokens);

    return tokens;
  }

  /**
   * Clear stored tokens (logout)
   */
  async clearTokens(): Promise<void> {
    this.tokenStorage.clearTokens(this.serverId);
  }

  /**
   * Open browser for OAuth authorization
   */
  async openBrowserForAuth(): Promise<{ authUrl: string; state: string }> {
    const { authUrl, state } = await this.startAuthorizationFlow();

    console.log(`Opening browser for OAuth authorization: ${authUrl}`);

    try {
      await open(authUrl);
    } catch (error) {
      console.error('Failed to open browser automatically. Please open this URL manually:');
      console.log(authUrl);
    }

    return { authUrl, state };
  }
}

// Singleton token storage instance
const globalTokenStorage = new TokenStorage();

/**
 * Utility functions for MCP OAuth authentication
 */
export const McpAuth = {
  /**
   * Create OAuth provider for a server
   */
  createProvider(
    serverId: string,
    serverUrl: string,
    config: MCPRemoteServerConfig
  ): McpOAuthProvider {
    return new McpOAuthProvider(serverId, serverUrl, config);
  },

  /**
   * Check if server has valid tokens
   */
  hasValidTokens(serverId: string): boolean {
    return globalTokenStorage.hasValidTokens(serverId);
  },

  /**
   * Get stored tokens for a server
   */
  getStoredTokens(serverId: string): OAuthTokens | undefined {
    return globalTokenStorage.getTokens(serverId);
  },

  /**
   * Clear tokens for a server
   */
  clearTokens(serverId: string): void {
    globalTokenStorage.clearTokens(serverId);
  },
};
