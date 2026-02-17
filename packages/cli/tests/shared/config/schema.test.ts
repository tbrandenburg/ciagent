import { describe, it, expect } from 'vitest';
import {
  MCPServerConfig,
  MCPLocalServerConfig,
  MCPRemoteServerConfig,
  LegacyMCPServerConfig,
  validateMCPConfig,
  validateMCPLocalServerConfig,
  validateMCPRemoteServerConfig,
  validateLegacyMCPServerConfig,
  validateSkillsConfig,
  validateToolRegistryConfig,
  validateConfigSection,
} from '../../../src/shared/config/schema.js';

describe('Enhanced MCP Configuration Schema', () => {
  describe('MCPLocalServerConfig validation', () => {
    it('should validate a valid local server config', () => {
      const config = {
        type: 'local' as const,
        command: 'git-mcp-server',
        args: ['--verbose'],
        environment: { GIT_MCP_DEBUG: '1' },
        timeout: 15000,
        enabled: true,
      };

      expect(validateMCPLocalServerConfig(config)).toBe(true);
    });

    it('should require type and command fields', () => {
      const invalidConfigs = [
        { command: 'test' }, // missing type
        { type: 'local' }, // missing command
        { type: 'remote', command: 'test' }, // wrong type
      ];

      invalidConfigs.forEach(config => {
        expect(validateMCPLocalServerConfig(config)).toBe(false);
      });
    });
  });

  describe('MCPRemoteServerConfig validation', () => {
    it('should validate a valid remote server config with OAuth', () => {
      const config = {
        type: 'remote' as const,
        url: 'https://api.github.com/mcp',
        oauth: {
          clientId: 'your-client-id',
          scope: 'repo:read',
        },
        timeout: 30000,
        enabled: true,
      };

      expect(validateMCPRemoteServerConfig(config)).toBe(true);
    });

    it('should validate a remote server config without OAuth', () => {
      const config = {
        type: 'remote' as const,
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer token' },
      };

      expect(validateMCPRemoteServerConfig(config)).toBe(true);
    });

    it('should require type and url fields', () => {
      const invalidConfigs = [
        { url: 'https://example.com' }, // missing type
        { type: 'remote' }, // missing url
        { type: 'local', url: 'https://example.com' }, // wrong type
      ];

      invalidConfigs.forEach(config => {
        expect(validateMCPRemoteServerConfig(config)).toBe(false);
      });
    });
  });

  describe('Legacy MCP config validation', () => {
    it('should validate a valid legacy config', () => {
      const config = {
        name: 'git-server',
        command: 'git-mcp-server',
        args: ['--verbose'],
        env: { GIT_MCP_DEBUG: '1' },
      };

      expect(validateLegacyMCPServerConfig(config)).toBe(true);
    });

    it('should require name and command fields', () => {
      const invalidConfigs = [
        { command: 'test' }, // missing name
        { name: 'test' }, // missing command
        {}, // missing both
      ];

      invalidConfigs.forEach(config => {
        expect(validateLegacyMCPServerConfig(config)).toBe(false);
      });
    });
  });

  describe('validateMCPConfig function', () => {
    it('should accept valid local server config', () => {
      const config = {
        type: 'local' as const,
        command: 'git-mcp-server',
        args: ['--verbose'],
      };

      const result = validateMCPConfig(config);
      expect(result).toEqual(config);
      expect((result as MCPLocalServerConfig).type).toBe('local');
    });

    it('should accept valid remote server config', () => {
      const config = {
        type: 'remote' as const,
        url: 'https://api.github.com/mcp',
        oauth: {
          clientId: 'client-123',
          scope: 'repo',
        },
      };

      const result = validateMCPConfig(config);
      expect(result).toEqual(config);
      expect((result as MCPRemoteServerConfig).type).toBe('remote');
    });

    it('should accept valid legacy config', () => {
      const config = {
        name: 'legacy-server',
        command: 'legacy-mcp-server',
        env: { DEBUG: '1' },
      };

      const result = validateMCPConfig(config);
      expect(result).toEqual(config);
      expect((result as LegacyMCPServerConfig).name).toBe('legacy-server');
    });

    it('should reject invalid configs', () => {
      const invalidConfigs = [
        null,
        'string',
        123,
        {},
        { type: 'invalid' },
        { type: 'local' }, // missing command
        { type: 'remote' }, // missing url
      ];

      invalidConfigs.forEach(config => {
        expect(() => validateMCPConfig(config)).toThrow();
      });
    });
  });

  describe('Skills Configuration', () => {
    it('should validate valid skills config', () => {
      const validConfig = {
        sources: [
          {
            name: 'test-skill',
            path: '/path/to/skill',
            enabled: true,
          },
        ],
      };

      expect(validateSkillsConfig(validConfig)).toBe(true);
    });

    it('should reject invalid skills config', () => {
      const invalidConfig = {
        sources: [
          {
            name: 'test-skill',
            // missing required path
            enabled: true,
          },
        ],
      };

      expect(validateSkillsConfig(invalidConfig)).toBe(false);
    });
  });

  describe('Tool Registry Configuration', () => {
    it('should validate valid tool registry config', () => {
      const validConfig = {
        enabled: true,
        maxTools: 100,
        timeout: 5000,
      };

      expect(validateToolRegistryConfig(validConfig)).toBe(true);
    });

    it('should validate empty tool registry config', () => {
      const emptyConfig = {};

      expect(validateToolRegistryConfig(emptyConfig)).toBe(true);
    });
  });

  describe('OpenCode compatibility', () => {
    it('should support OpenCode-style local server config', () => {
      const openCodeLocalConfig = {
        type: 'local' as const,
        command: 'git-mcp-server',
        args: ['--verbose'],
        environment: { GIT_MCP_DEBUG: '1' }, // OpenCode uses 'environment' not 'env'
        timeout: 15000,
        enabled: true,
      };

      const result = validateMCPConfig(openCodeLocalConfig);
      expect(result).toEqual(openCodeLocalConfig);
      expect((result as MCPLocalServerConfig).environment).toEqual({
        GIT_MCP_DEBUG: '1',
      });
    });

    it('should support OpenCode-style remote server config', () => {
      const openCodeRemoteConfig = {
        type: 'remote' as const,
        url: 'https://api.github.com/mcp',
        oauth: {
          clientId: 'your-client-id',
          scope: 'repo:read',
        },
        timeout: 30000,
        enabled: true,
      };

      const result = validateMCPConfig(openCodeRemoteConfig);
      expect(result).toEqual(openCodeRemoteConfig);
      expect((result as MCPRemoteServerConfig).oauth).toEqual({
        clientId: 'your-client-id',
        scope: 'repo:read',
      });
    });
  });

  describe('TypeScript discriminated union support', () => {
    it('should provide type narrowing for local configs', () => {
      const config: MCPServerConfig = {
        type: 'local' as const,
        command: 'test-server',
      };

      if (config.type === 'local') {
        // TypeScript should narrow the type here
        expect(config.command).toBe('test-server');
        // This should not cause a TypeScript error
        const command: string = config.command;
        expect(typeof command).toBe('string');
      }
    });

    it('should provide type narrowing for remote configs', () => {
      const config: MCPServerConfig = {
        type: 'remote' as const,
        url: 'https://example.com',
      };

      if (config.type === 'remote') {
        // TypeScript should narrow the type here
        expect(config.url).toBe('https://example.com');
        // This should not cause a TypeScript error
        const url: string = config.url;
        expect(typeof url).toBe('string');
      }
    });
  });

  describe('Config Section Validation Helper', () => {
    it('should return valid data when validation passes', () => {
      const validData = {
        name: 'test-server',
        command: 'node server.js',
      };

      const result = validateConfigSection(
        validData,
        validateLegacyMCPServerConfig,
        'Legacy MCP Server'
      );
      expect(result).toEqual(validData);
    });

    it('should throw error when validation fails', () => {
      const invalidData = {
        name: 'test-server',
        // missing command
      };

      expect(() => {
        validateConfigSection(invalidData, validateLegacyMCPServerConfig, 'Legacy MCP Server');
      }).toThrow('Invalid Legacy MCP Server configuration');
    });
  });
});
