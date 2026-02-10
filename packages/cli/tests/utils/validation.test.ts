import { describe, it, expect } from 'bun:test';
import {
  validateConfig,
  validateProvider,
  validateModel,
  validateExecutionRequirements,
} from '../../src/shared/validation/validation.js';
import { CIAConfig } from '../../src/shared/config/loader.js';

describe('Input Validation', () => {
  describe('validateConfig', () => {
    it('should validate mode values', () => {
      const validConfig: CIAConfig = { mode: 'lazy' };
      const result = validateConfig(validConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid mode values', () => {
      const invalidConfig: CIAConfig = { mode: 'invalid' as any };
      const result = validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid mode: invalid. Must be 'lazy' or 'strict'.");
    });

    it('should validate format values', () => {
      const validConfig: CIAConfig = { format: 'json' };
      const result = validateConfig(validConfig);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid format values', () => {
      const invalidConfig: CIAConfig = { format: 'invalid' as any };
      const result = validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid format: invalid. Must be 'default' or 'json'.");
    });

    it('should require schema in strict mode', () => {
      const strictConfig: CIAConfig = { mode: 'strict' };
      const result = validateConfig(strictConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Strict mode requires either --schema-file or --schema-inline to be specified.'
      );
    });

    it('should accept schema-file in strict mode', () => {
      const strictConfig: CIAConfig = {
        mode: 'strict',
        'schema-file': '/nonexistent/file.json', // File existence checked separately
      };
      const result = validateConfig(strictConfig);
      // Should have file not found error, but not the strict mode error
      expect(result.errors.some(e => e.includes('Strict mode requires'))).toBe(false);
    });

    it('should accept schema-inline in strict mode', () => {
      const strictConfig: CIAConfig = {
        mode: 'strict',
        'schema-inline': '{"type": "object"}',
      };
      const result = validateConfig(strictConfig);
      // Should pass strict mode validation
      expect(result.errors.some(e => e.includes('Strict mode requires'))).toBe(false);
    });

    it('should validate JSON in schema-inline', () => {
      const invalidSchemaConfig: CIAConfig = {
        'schema-inline': '{ invalid json }',
      };
      const result = validateConfig(invalidSchemaConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid JSON in --schema-inline option.');
    });

    it('should validate timeout is positive number', () => {
      const invalidConfig: CIAConfig = { timeout: -5 };
      const result = validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid timeout: -5. Must be a positive number.');
    });

    it('should validate retries is non-negative', () => {
      const invalidConfig: CIAConfig = { retries: -1 };
      const result = validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid retries: -1. Must be a non-negative number.');
    });

    it('should validate log-level values', () => {
      const validConfig: CIAConfig = { 'log-level': 'DEBUG' };
      const result = validateConfig(validConfig);
      expect(result.isValid).toBe(true);

      const invalidConfig: CIAConfig = { 'log-level': 'INVALID' };
      const invalidResult = validateConfig(invalidConfig);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain(
        'Invalid log-level: INVALID. Must be one of: DEBUG, INFO, WARN, ERROR.'
      );
    });
  });

  describe('validateProvider', () => {
    it('should accept valid providers', () => {
      const validProviders = ['codex', 'claude'];
      validProviders.forEach(provider => {
        const result = validateProvider(provider);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject invalid providers', () => {
      const result = validateProvider('invalid-provider');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Invalid provider: invalid-provider. Must be one of: codex, claude.'
      );
    });

    it('should require provider', () => {
      const result = validateProvider();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Provider is required');
    });
  });

  describe('validateModel', () => {
    it('should accept valid model names', () => {
      const validModels = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-sonnet', 'gemini-pro'];
      validModels.forEach(model => {
        const result = validateModel(model);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject invalid model name formats', () => {
      const result = validateModel('invalid model name!');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Invalid model name format: invalid model name!. Must contain only alphanumeric characters, dashes, and dots.'
      );
    });

    it('should require model', () => {
      const result = validateModel();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model is required');
    });
  });

  describe('validateExecutionRequirements', () => {
    it('should validate complete execution config', () => {
      const config: CIAConfig = {
        provider: 'codex',
        model: 'gpt-4',
      };
      const result = validateExecutionRequirements(config);
      expect(result.isValid).toBe(true);
    });

    it('should reject missing provider', () => {
      const config: CIAConfig = {
        model: 'gpt-4',
      };
      const result = validateExecutionRequirements(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Provider is required');
    });

    it('should reject missing model', () => {
      const config: CIAConfig = {
        provider: 'codex',
      };
      const result = validateExecutionRequirements(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Model is required for execution. Use --model or set CIA_MODEL environment variable.'
      );
    });
  });
});
