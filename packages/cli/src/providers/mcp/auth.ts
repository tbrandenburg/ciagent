/**
 * OAuth 2.1 Authentication for Remote MCP Servers
 * Implements PKCE flow with secure token storage using simple-oauth2
 */

import { randomBytes, createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import open from 'open';
import { AuthorizationCode } from 'simple-oauth2';
import { discoverOAuthMetadata } from '@modelcontextprotocol/sdk/client/auth.js';
import type { MCPRemoteServerConfig } from '../../shared/config/schema.js';

// OAuth types based on SDK schemas and simple-oauth2
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
 * OAuth 2.1 PKCE provider for MCP servers using simple-oauth2
 */
export class McpOAuthProvider {
  private tokenStorage: TokenStorage;
  private callbackPort: number;
  private callbackPath: string;
  private oauth2?: AuthorizationCode;
  private codeVerifier?: string;
  private state?: string;

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

  /**
   * Initialize OAuth client with discovered endpoints
   */
  private async initializeOAuthClient(): Promise<void> {
    if (this.config.oauth === false || !this.config.oauth) {
      throw new Error('OAuth configuration is required');
    }

    // Discover OAuth metadata from server
    const metadata = await discoverOAuthMetadata(new URL(this.serverUrl));

    if (!metadata?.authorization_endpoint || !metadata?.token_endpoint) {
      throw new Error(`OAuth metadata discovery failed for ${this.serverUrl}`);
    }

    // Initialize simple-oauth2 client
    this.oauth2 = new AuthorizationCode({
      client: {
        id: this.config.oauth.clientId,
        secret: this.config.oauth.clientSecret || '',
      },
      auth: {
        tokenHost: new URL(metadata.token_endpoint).origin,
        tokenPath: new URL(metadata.token_endpoint).pathname,
        authorizeHost: new URL(metadata.authorization_endpoint).origin,
        authorizePath: new URL(metadata.authorization_endpoint).pathname,
      },
    });
  }

  /**
   * Get existing valid tokens or null if none exist/expired
   */
  async getValidToken(): Promise<OAuthTokens | null> {
    const tokens = this.tokenStorage.getTokens(this.serverId);
    if (!tokens) {
      return null;
    }

    // Check if token is expired and refresh if possible
    if (tokens.refresh_token && this.isTokenExpired(tokens)) {
      try {
        // Initialize OAuth client if not already done
        if (!this.oauth2) {
          await this.initializeOAuthClient();
        }

        const refreshedTokens = await this.refreshTokens(tokens.refresh_token);
        return refreshedTokens;
      } catch (error) {
        console.error(`Failed to refresh token for ${this.serverId}:`, error);
        this.tokenStorage.clearTokens(this.serverId);
        return null;
      }
    }

    return tokens;
  }

  /**
   * Start OAuth authorization flow
   */
  async authorize(): Promise<void> {
    // Initialize OAuth client with discovered endpoints
    await this.initializeOAuthClient();

    if (!this.oauth2) {
      throw new Error('OAuth client not initialized');
    }

    if (this.config.oauth === false || !this.config.oauth) {
      throw new Error('OAuth configuration is required');
    }

    // Generate PKCE parameters
    this.codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(this.codeVerifier);
    this.state = generateState();

    // Create authorization URL with PKCE parameters
    // We need to manually construct URL since simple-oauth2 doesn't support PKCE directly
    const baseUrl = this.oauth2.authorizeURL({
      redirect_uri: this.redirectUrl,
      scope: this.config.oauth.scope || '',
      state: this.state,
    });

    // Add PKCE parameters manually
    const authUrl = new URL(baseUrl);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    const authorizationUrl = authUrl.toString();

    console.log(`🔐 Opening browser for OAuth authorization...`);
    console.log(`If browser doesn't open, visit: ${authorizationUrl}`);

    // Start callback server
    await this.startCallbackServer();

    // Open browser
    try {
      await open(authorizationUrl);
    } catch (error) {
      console.error('Failed to open browser automatically:', error);
      console.log(`Please manually visit: ${authorizationUrl}`);
    }
  }

  /**
   * Start HTTP server to handle OAuth callback
   */
  private async startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        if (!req.url?.startsWith(this.callbackPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        try {
          const url = new URL(req.url, `http://localhost:${this.callbackPort}`);
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            throw new Error(`OAuth error: ${error}`);
          }

          if (!code || !state) {
            throw new Error('Missing code or state parameter');
          }

          if (state !== this.state) {
            throw new Error('Invalid state parameter');
          }

          // Exchange code for tokens
          const tokens = await this.exchangeCodeForTokens(code);

          // Store tokens
          this.tokenStorage.setTokens(this.serverId, tokens);

          // Send success response
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h2>✅ Authentication Successful</h2>
                <p>You have successfully authenticated with ${this.serverId}.</p>
                <p>You can close this window and return to the CLI.</p>
                <script>setTimeout(() => window.close(), 3000);</script>
              </body>
            </html>
          `);

          console.log(`✅ Successfully authenticated with ${this.serverId}`);
        } catch (error) {
          console.error(`❌ Authentication failed:`, error);

          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h2>❌ Authentication Failed</h2>
                <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
                <p>Please try again or check your configuration.</p>
              </body>
            </html>
          `);
        } finally {
          server.close();
        }
      });

      server.listen(this.callbackPort, '127.0.0.1', () => {
        console.log(
          `🌐 Callback server listening on http://127.0.0.1:${this.callbackPort}${this.callbackPath}`
        );
        resolve();
      });

      server.on('error', error => {
        if ((error as any).code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${this.callbackPort} is already in use. Please ensure no other application is using this port.`
            )
          );
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    if (!this.codeVerifier || !this.oauth2) {
      throw new Error('Code verifier or OAuth client not available');
    }

    const tokenParams = {
      code,
      redirect_uri: this.redirectUrl,
      code_verifier: this.codeVerifier,
    };

    try {
      const accessToken = await this.oauth2.getToken(tokenParams);

      // Convert simple-oauth2 token format to our format
      return {
        access_token: accessToken.token.access_token as string,
        refresh_token: accessToken.token.refresh_token as string,
        expires_in: accessToken.token.expires_in as number,
        token_type: (accessToken.token.token_type as string) || 'Bearer',
        scope: accessToken.token.scope as string,
      };
    } catch (error) {
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }
  }

  /**
   * Refresh access tokens using refresh token
   */
  private async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    if (!this.oauth2) {
      throw new Error('OAuth client not initialized');
    }

    // Create AccessToken instance for refresh
    const accessToken = this.oauth2.createToken({
      access_token: '', // Not needed for refresh
      refresh_token: refreshToken,
    });

    try {
      const refreshedToken = await accessToken.refresh();

      // Convert to our format and store
      const tokens: OAuthTokens = {
        access_token: refreshedToken.token.access_token as string,
        refresh_token: refreshedToken.token.refresh_token as string,
        expires_in: refreshedToken.token.expires_in as number,
        token_type: (refreshedToken.token.token_type as string) || 'Bearer',
        scope: refreshedToken.token.scope as string,
      };

      this.tokenStorage.setTokens(this.serverId, tokens);
      return tokens;
    } catch (error) {
      throw new Error(`Failed to refresh tokens: ${error}`);
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(tokens: OAuthTokens): boolean {
    if (!tokens.expires_in) {
      return false; // If no expiry info, assume valid
    }

    // For testing purposes, we'll be conservative and not refresh unless we have a proper timestamp
    // In a real implementation, we'd store the issued_at time and compare
    return false; // Assume tokens are still valid for testing
  }

  /**
   * Clear stored tokens for this server
   */
  async clearTokens(): Promise<void> {
    this.tokenStorage.clearTokens(this.serverId);
    console.log(`🗑️ Cleared tokens for ${this.serverId}`);
  }

  /**
   * Check if we have valid tokens stored
   */
  hasStoredTokens(): boolean {
    return this.tokenStorage.hasValidTokens(this.serverId);
  }
}

/**
 * Factory function to create OAuth provider from server config
 */
export function createOAuthProvider(
  serverId: string,
  serverUrl: string,
  config: MCPRemoteServerConfig,
  options?: { callbackPort?: number; callbackPath?: string }
): McpOAuthProvider | null {
  if (config.oauth === false || !config.oauth) {
    return null;
  }

  return new McpOAuthProvider(serverId, serverUrl, config, options);
}
