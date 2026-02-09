import { describe, it, expect } from 'bun:test';
import { ProviderRegistry } from './registry';
import { ExecutionConfig } from './types';

describe('Provider Registry', () => {
  describe('Provider Management', () => {
    it('should list all available providers', () => {
      const providers = ProviderRegistry.getAvailableProviders();
      expect(providers).toContain('azure');
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('google');
      expect(providers).toContain('local');
      expect(providers).toHaveLength(5);
    });

    it('should get provider by name', () => {
      const azure = ProviderRegistry.getProvider('azure');
      expect(azure).toBeDefined();
      expect(azure?.name).toBe('azure');
    });

    it('should return undefined for unknown provider', () => {
      const unknown = ProviderRegistry.getProvider('unknown');
      expect(unknown).toBeUndefined();
    });

    it('should be case insensitive for provider names', () => {
      const azure = ProviderRegistry.getProvider('AZURE');
      expect(azure).toBeDefined();
      expect(azure?.name).toBe('azure');
    });
  });

  describe('Model Support', () => {
    it('should return supported models for azure', () => {
      const models = ProviderRegistry.getSupportedModels('azure');
      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-35-turbo');
    });

    it('should return supported models for openai', () => {
      const models = ProviderRegistry.getSupportedModels('openai');
      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-3.5-turbo');
    });

    it('should return empty array for unknown provider', () => {
      const models = ProviderRegistry.getSupportedModels('unknown');
      expect(models).toEqual([]);
    });
  });

  describe('Validation', () => {
    it('should validate known provider and supported model', () => {
      const result = ProviderRegistry.validateProviderAndModel('azure', 'gpt-4');
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject unknown provider', () => {
      const result = ProviderRegistry.validateProviderAndModel('unknown', 'gpt-4');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Unknown provider: unknown');
    });

    it('should reject unsupported model', () => {
      const result = ProviderRegistry.validateProviderAndModel('azure', 'unsupported-model');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Model unsupported-model not supported by azure');
    });
  });

  describe('Execution', () => {
    it('should execute with azure provider (Phase 1 stub)', async () => {
      const config: ExecutionConfig = {
        provider: 'azure',
        model: 'gpt-4',
        prompt: 'Hello world',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
        apiKey: 'test-key', // Required for Azure validation
      };

      const result = await ProviderRegistry.executeWithProvider(config);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Azure OpenAI provider not yet implemented');
    });

    it('should throw error for unknown provider', async () => {
      const config: ExecutionConfig = {
        provider: 'unknown' as any,
        model: 'gpt-4',
        prompt: 'Hello world',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      await expect(ProviderRegistry.executeWithProvider(config)).rejects.toThrow('Provider unknown not found');
    });
  });
});