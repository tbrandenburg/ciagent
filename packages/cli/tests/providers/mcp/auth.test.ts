import { describe, it, expect, vi } from 'vitest';
import { McpOAuthProvider, McpAuth, OAuthTokens } from '../../../src/providers/mcp/auth.ts';
import { MCPRemoteServerConfig } from '../../../src/shared/config/schema.ts';

// Mock external dependencies
vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  discoverOAuthMetadata: vi.fn(),
}));

describe('MCP OAuth Authentication', () => {
  const testServerId = 'test-server';
  const testServerUrl = 'https://api.example.com';
  const testConfig: MCPRemoteServerConfig = {
    type: 'remote',
    url: testServerUrl,
    oauth: {
      clientId: 'test-client-id',
      scope: 'read write',
    },
  };

  describe('McpOAuthProvider', () => {
    describe('constructor and basic properties', () => {
      it('should initialize with correct redirect URL', () => {
        const oauthProvider = new McpOAuthProvider(testServerId, testServerUrl, testConfig);
        expect(oauthProvider.redirectUrl).toBe('http://127.0.0.1:19876/mcp/oauth/callback');
      });

      it('should provide correct client metadata', () => {
        const oauthProvider = new McpOAuthProvider(testServerId, testServerUrl, testConfig);
        const metadata = oauthProvider.clientMetadata;

        expect(metadata.redirect_uris).toEqual(['http://127.0.0.1:19876/mcp/oauth/callback']);
        expect(metadata.client_name).toBe('CIA Agent');
        expect(metadata.grant_types).toEqual(['authorization_code', 'refresh_token']);
        expect(metadata.response_types).toEqual(['code']);
        expect(metadata.token_endpoint_auth_method).toBe('none'); // No client secret
      });

      it('should use client_secret_post when client secret is provided', () => {
        const configWithSecret: MCPRemoteServerConfig = {
          ...testConfig,
          oauth: {
            clientId: 'test-client-id',
            clientSecret: 'test-secret',
            scope: 'read',
          },
        };

        const providerWithSecret = new McpOAuthProvider(
          testServerId,
          testServerUrl,
          configWithSecret
        );
        expect(providerWithSecret.clientMetadata.token_endpoint_auth_method).toBe(
          'client_secret_post'
        );
      });

      it('should allow custom callback port and path', () => {
        const customProvider = new McpOAuthProvider(testServerId, testServerUrl, testConfig, {
          callbackPort: 8080,
          callbackPath: '/custom/callback',
        });

        expect(customProvider.redirectUrl).toBe('http://127.0.0.1:8080/custom/callback');
      });
    });

    describe('authorization flow validation', () => {
      it('should throw error for missing OAuth config', async () => {
        const configWithoutOAuth: MCPRemoteServerConfig = {
          type: 'remote',
          url: testServerUrl,
        };

        const provider = new McpOAuthProvider(testServerId, testServerUrl, configWithoutOAuth);

        await expect(provider.startAuthorizationFlow()).rejects.toThrow(
          'OAuth configuration required'
        );
      });

      it('should throw error for missing client ID', async () => {
        const configWithoutClientId: MCPRemoteServerConfig = {
          type: 'remote',
          url: testServerUrl,
          oauth: {
            clientId: '',
          },
        };

        const provider = new McpOAuthProvider(testServerId, testServerUrl, configWithoutClientId);

        await expect(provider.startAuthorizationFlow()).rejects.toThrow('OAuth clientId required');
      });

      it('should throw error for OAuth config set to false', async () => {
        const configWithOAuthFalse: MCPRemoteServerConfig = {
          type: 'remote',
          url: testServerUrl,
          oauth: false,
        };

        const provider = new McpOAuthProvider(testServerId, testServerUrl, configWithOAuthFalse);

        await expect(provider.startAuthorizationFlow()).rejects.toThrow(
          'OAuth configuration required'
        );
      });
    });

    describe('authorization URL generation', () => {
      it('should generate authorization URL with correct PKCE parameters', async () => {
        const { discoverOAuthMetadata } = await import('@modelcontextprotocol/sdk/client/auth.js');

        const mockMetadata = {
          issuer: 'https://api.example.com',
          authorization_endpoint: 'https://api.example.com/oauth/authorize',
          token_endpoint: 'https://api.example.com/oauth/token',
          response_types_supported: ['code'],
        };

        vi.mocked(discoverOAuthMetadata).mockResolvedValueOnce(mockMetadata);

        const provider = new McpOAuthProvider(testServerId, testServerUrl, testConfig);
        const result = await provider.startAuthorizationFlow();

        expect(result.authUrl).toContain('https://api.example.com/oauth/authorize');
        expect(result.authUrl).toContain('client_id=test-client-id');
        expect(result.authUrl).toContain('response_type=code');
        expect(result.authUrl).toContain('code_challenge_method=S256');
        expect(result.authUrl).toContain('scope=read+write');
        expect(result.state).toBeDefined();
        expect(result.state).toMatch(/^[a-f0-9]{32}$/); // 16 bytes = 32 hex chars

        // Verify PKCE code challenge is present and valid format
        const url = new URL(result.authUrl);
        const codeChallenge = url.searchParams.get('code_challenge');
        expect(codeChallenge).toBeDefined();
        expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/); // Base64URL format
      });

      it('should handle missing authorization endpoint', async () => {
        const { discoverOAuthMetadata } = await import('@modelcontextprotocol/sdk/client/auth.js');

        const mockMetadata = {
          issuer: 'https://api.example.com',
          token_endpoint: 'https://api.example.com/oauth/token',
          response_types_supported: ['code'],
        };

        vi.mocked(discoverOAuthMetadata).mockResolvedValueOnce(mockMetadata as any);

        const provider = new McpOAuthProvider(testServerId, testServerUrl, testConfig);

        await expect(provider.startAuthorizationFlow()).rejects.toThrow(
          'No authorization endpoint found'
        );
      });
    });

    describe('configuration validation', () => {
      it('should handle different OAuth configuration formats', () => {
        // Test with minimal config
        const minimalConfig: MCPRemoteServerConfig = {
          type: 'remote',
          url: testServerUrl,
          oauth: {
            clientId: 'test-id',
          },
        };

        const provider = new McpOAuthProvider(testServerId, testServerUrl, minimalConfig);
        expect(provider.clientMetadata.token_endpoint_auth_method).toBe('none');

        // Test with full config
        const fullConfig: MCPRemoteServerConfig = {
          type: 'remote',
          url: testServerUrl,
          oauth: {
            clientId: 'test-id',
            clientSecret: 'test-secret',
            scope: 'read write admin',
          },
        };

        const fullProvider = new McpOAuthProvider(testServerId, testServerUrl, fullConfig);
        expect(fullProvider.clientMetadata.token_endpoint_auth_method).toBe('client_secret_post');
      });
    });
  });

  describe('McpAuth utility functions', () => {
    it('should create OAuth provider', () => {
      const provider = McpAuth.createProvider(testServerId, testServerUrl, testConfig);
      expect(provider).toBeInstanceOf(McpOAuthProvider);
      expect(provider.redirectUrl).toContain('127.0.0.1');
    });
  });

  describe('OAuth types and interfaces', () => {
    it('should define proper OAuth token structure', () => {
      const tokens: OAuthTokens = {
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
      };

      expect(tokens.access_token).toBe('test-token');
      expect(tokens.refresh_token).toBe('refresh-token');
      expect(tokens.expires_in).toBe(3600);
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.scope).toBe('read write');
    });

    it('should support minimal OAuth token structure', () => {
      const minimalTokens: OAuthTokens = {
        access_token: 'test-token',
      };

      expect(minimalTokens.access_token).toBe('test-token');
      expect(minimalTokens.refresh_token).toBeUndefined();
    });
  });

  describe('integration with OpenCode patterns', () => {
    it('should support OpenCode-compatible client metadata', () => {
      const provider = new McpOAuthProvider(testServerId, testServerUrl, testConfig);
      const metadata = provider.clientMetadata;

      // Should match OpenCode's client metadata format
      expect(metadata).toHaveProperty('redirect_uris');
      expect(metadata).toHaveProperty('client_name');
      expect(metadata).toHaveProperty('grant_types');
      expect(metadata).toHaveProperty('response_types');
      expect(metadata.grant_types).toContain('authorization_code');
      expect(metadata.grant_types).toContain('refresh_token');
      expect(metadata.response_types).toContain('code');
    });

    it('should use CIA Agent branding instead of OpenCode', () => {
      const provider = new McpOAuthProvider(testServerId, testServerUrl, testConfig);
      const metadata = provider.clientMetadata;

      expect(metadata.client_name).toBe('CIA Agent');
      expect(metadata.client_uri).toContain('github.com/tbrandenburg/ciagent');
    });
  });

  describe('security features', () => {
    it('should generate secure random values', async () => {
      const { discoverOAuthMetadata } = await import('@modelcontextprotocol/sdk/client/auth.js');

      const mockMetadata = {
        issuer: 'https://api.example.com',
        authorization_endpoint: 'https://api.example.com/oauth/authorize',
        token_endpoint: 'https://api.example.com/oauth/token',
        response_types_supported: ['code'],
      };

      vi.mocked(discoverOAuthMetadata).mockResolvedValue(mockMetadata);

      const provider = new McpOAuthProvider(testServerId, testServerUrl, testConfig);

      // Generate multiple authorization flows to test randomness
      const result1 = await provider.startAuthorizationFlow();
      const result2 = await provider.startAuthorizationFlow();

      expect(result1.state).not.toBe(result2.state);

      const url1 = new URL(result1.authUrl);
      const url2 = new URL(result2.authUrl);
      const challenge1 = url1.searchParams.get('code_challenge');
      const challenge2 = url2.searchParams.get('code_challenge');

      expect(challenge1).not.toBe(challenge2);
    });

    it('should use PKCE with SHA256', async () => {
      const { discoverOAuthMetadata } = await import('@modelcontextprotocol/sdk/client/auth.js');

      const mockMetadata = {
        issuer: 'https://api.example.com',
        authorization_endpoint: 'https://api.example.com/oauth/authorize',
        token_endpoint: 'https://api.example.com/oauth/token',
        response_types_supported: ['code'],
      };

      vi.mocked(discoverOAuthMetadata).mockResolvedValueOnce(mockMetadata);

      const provider = new McpOAuthProvider(testServerId, testServerUrl, testConfig);
      const result = await provider.startAuthorizationFlow();

      const url = new URL(result.authUrl);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeDefined();
    });
  });
});
