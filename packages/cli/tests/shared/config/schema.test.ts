import { describe, it, expect } from 'vitest';
import {
  validateMCPServerConfig,
  validateSkillsConfig,
  validateToolRegistryConfig,
  validateConfigSection,
} from '../../../src/shared/config/schema';

describe('Config Schema Validation', () => {
  describe('MCP Server Configuration', () => {
    it('should validate valid MCP server config', () => {
      const validConfig = {
        name: 'test-server',
        command: 'node server.js',
        args: ['--port', '3000'],
        env: { NODE_ENV: 'production' },
      };

      expect(validateMCPServerConfig(validConfig)).toBe(true);
    });

    it('should reject invalid MCP server config', () => {
      const invalidConfig = {
        name: 'test-server',
        // missing required command
        args: ['--port', '3000'],
      };

      expect(validateMCPServerConfig(invalidConfig)).toBe(false);
    });

    it('should validate MCP server config with minimal fields', () => {
      const minimalConfig = {
        name: 'test-server',
        command: 'node server.js',
      };

      expect(validateMCPServerConfig(minimalConfig)).toBe(true);
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

  describe('Config Section Validation Helper', () => {
    it('should return valid data when validation passes', () => {
      const validData = {
        name: 'test-server',
        command: 'node server.js',
      };

      const result = validateConfigSection(validData, validateMCPServerConfig, 'MCP Server');
      expect(result).toEqual(validData);
    });

    it('should throw error when validation fails', () => {
      const invalidData = {
        name: 'test-server',
        // missing command
      };

      expect(() => {
        validateConfigSection(invalidData, validateMCPServerConfig, 'MCP Server');
      }).toThrow('Invalid MCP Server configuration');
    });
  });
});
