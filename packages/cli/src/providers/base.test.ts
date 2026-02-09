import { describe, it, expect, beforeEach } from 'bun:test';
import { BaseProvider } from './base';
import { ExecutionConfig, ExecutionResult } from './types';

// Test implementation of BaseProvider
class TestProvider extends BaseProvider {
  readonly name = 'test';
  readonly supportedModels = ['test-model'];
  
  private initializeCalled = false;

  protected async doInitialize(_config: ExecutionConfig): Promise<void> {
    this.initializeCalled = true;
  }

  async execute(config: ExecutionConfig): Promise<ExecutionResult> {
    return this.createSuccessResult(`Test response for: ${config.prompt}`, 100);
  }

  protected validateProviderSpecific(_config: ExecutionConfig): string[] {
    return [];
  }

  // Expose protected methods for testing
  public testCreateErrorResult(error: string) {
    return this.createErrorResult(error);
  }

  public testCreateSuccessResult(content: string, duration: number) {
    return this.createSuccessResult(content, duration);
  }

  public wasInitializeCalled() {
    return this.initializeCalled;
  }
}

describe('Base Provider', () => {
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
  });

  describe('Initialization', () => {
    it('should initialize with valid config', async () => {
      const config: ExecutionConfig = {
        provider: 'azure',
        model: 'test-model',
        prompt: 'Hello world',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      await provider.initialize(config);
      
      expect(provider.isReady()).toBe(true);
      expect(provider.wasInitializeCalled()).toBe(true);
    });

    it('should fail initialization with invalid config', async () => {
      const config: ExecutionConfig = {
        provider: 'azure',
        model: '', // Missing model
        prompt: 'Hello world',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      await expect(provider.initialize(config)).rejects.toThrow('Provider initialization failed: Model is required');
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required fields', () => {
      const config: ExecutionConfig = {
        provider: 'azure',
        model: '',
        prompt: '',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      const result = provider.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model is required');
      expect(result.errors).toContain('Prompt is required');
    });

    it('should validate strict mode requirements', () => {
      const config: ExecutionConfig = {
        provider: 'azure',
        model: 'test-model',
        prompt: 'Hello world',
        mode: 'strict', // Requires schema
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      const result = provider.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Strict mode requires either schema-file or schema-inline parameter');
    });

    it('should pass validation with valid config', () => {
      const config: ExecutionConfig = {
        provider: 'azure',
        model: 'test-model',
        prompt: 'Hello world',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      const result = provider.validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Result Creation', () => {
    beforeEach(async () => {
      const config: ExecutionConfig = {
        provider: 'azure',
        model: 'test-model',
        prompt: 'Hello world',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };
      await provider.initialize(config);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required fields', () => {
      const config: ExecutionConfig = {
        provider: 'test',
        model: '',
        prompt: '',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      const result = provider.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model is required');
      expect(result.errors).toContain('Prompt is required');
    });

    it('should validate strict mode requirements', () => {
      const config: ExecutionConfig = {
        provider: 'test',
        model: 'test-model',
        prompt: 'Hello world',
        mode: 'strict', // Requires schema
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      const result = provider.validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Strict mode requires either schema-file or schema-inline parameter');
    });

    it('should pass validation with valid config', () => {
      const config: ExecutionConfig = {
        provider: 'test',
        model: 'test-model',
        prompt: 'Hello world',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };

      const result = provider.validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Result Creation', () => {
    beforeEach(async () => {
      const config: ExecutionConfig = {
        provider: 'test',
        model: 'test-model',
        prompt: 'Hello world',
        mode: 'lazy',
        retries: 1,
        retryBackoff: true,
        timeout: 60,
        logLevel: 'INFO',
      };
      await provider.initialize(config);
    });

    it('should create error result', () => {
      const result = provider.testCreateErrorResult('Test error');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
      expect(result.metadata?.provider).toBe('test');
      expect(result.metadata?.model).toBe('test-model');
      expect(result.metadata?.duration).toBe(0);
    });

    it('should create success result', () => {
      const result = provider.testCreateSuccessResult('Test content', 150);
      
      expect(result.success).toBe(true);
      expect(result.content).toBe('Test content');
      expect(result.metadata?.provider).toBe('test');
      expect(result.metadata?.model).toBe('test-model');
      expect(result.metadata?.duration).toBe(150);
    });
  });
});