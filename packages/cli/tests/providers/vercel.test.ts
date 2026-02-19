import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LanguageModel } from 'ai';

// Mock the Vercel AI SDK modules
const mockAzureProvider = vi.fn();
const mockCreateAzure = vi.fn();
const mockOpenAIProvider = vi.fn();
const mockGoogleProvider = vi.fn();
const mockAnthropicProvider = vi.fn();

// Mock LanguageModel
const createMockLanguageModel = (modelName: string): LanguageModel =>
  modelName as unknown as LanguageModel;

function mockVercelSDKs() {
  vi.doMock('@ai-sdk/azure', () => ({
    azure: mockAzureProvider,
    createAzure: mockCreateAzure,
  }));

  vi.doMock('@ai-sdk/openai', () => ({
    openai: mockOpenAIProvider,
  }));

  vi.doMock('@ai-sdk/google', () => ({
    google: mockGoogleProvider,
  }));

  vi.doMock('@ai-sdk/anthropic', () => ({
    anthropic: mockAnthropicProvider,
  }));
}

describe('Vercel Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.resetModules() not available in Vitest 1.6.0, using clearAllMocks() is sufficient
  });

  describe('VercelAssistantChat', () => {
    it('creates a provider with correct configuration', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      const mockProviderCreator = vi.fn().mockReturnValue(mockModel);
      mockCreateAzure.mockReturnValue(mockProviderCreator);

      const { VercelAssistantChat } = await import('../../src/providers/vercel.js');

      const provider = await VercelAssistantChat.create('azure', {
        model: 'gpt-4o',
        resourceName: 'test-resource',
        apiKey: 'test-key',
      });

      expect(provider).toBeDefined();
      expect(provider.getType()).toBe('vercel-azure');
    });

    it('initializes language model through factory', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      mockAzureProvider.mockReturnValue(mockModel);

      const { VercelAssistantChat } = await import('../../src/providers/vercel.js');

      const provider = await VercelAssistantChat.create('azure', {
        model: 'gpt-4o',
      });

      expect(mockAzureProvider).toHaveBeenCalledWith('gpt-4o');
      expect(provider).toBeDefined();
    });

    it('implements IAssistantChat interface correctly', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      mockAzureProvider.mockReturnValue(mockModel);

      const { VercelAssistantChat } = await import('../../src/providers/vercel.js');

      const provider = await VercelAssistantChat.create('azure', {
        model: 'gpt-4o',
      });

      // Test interface implementation
      expect(provider.getType()).toBe('vercel-azure');
      expect(typeof provider.sendQuery).toBe('function');
    });

    it('handles sendQuery requests properly', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      const mockStreamText = vi.fn().mockResolvedValue({
        textStream: (async function* () {
          yield 'Test ';
          yield 'response';
        })(),
      });

      // Mock the streamText function from 'ai'
      vi.doMock('ai', () => ({
        streamText: mockStreamText,
      }));

      mockAzureProvider.mockReturnValue(mockModel);

      const { VercelAssistantChat } = await import('../../src/providers/vercel.js');

      const provider = await VercelAssistantChat.create('azure', {
        model: 'gpt-4o',
      });

      const chunks: any[] = [];
      for await (const chunk of provider.sendQuery('Hello', '/tmp')) {
        chunks.push(chunk);
      }

      expect(mockStreamText).toHaveBeenCalledWith({
        model: mockModel,
        prompt: 'Hello',
      });

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('VercelProviderFactory', () => {
    it('creates Azure provider successfully', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      const mockProviderCreator = vi.fn().mockReturnValue(mockModel);
      mockCreateAzure.mockReturnValue(mockProviderCreator);

      const { VercelProviderFactory } = await import('../../src/providers/vercel-factory.js');

      const provider = await VercelProviderFactory.createProvider('azure', {
        model: 'gpt-4o',
        resourceName: 'test-resource',
        apiKey: 'test-key',
      });

      expect(provider).toBe(mockModel);
      expect(mockCreateAzure).toHaveBeenCalledWith({
        resourceName: 'test-resource',
        apiKey: 'test-key',
        baseURL: undefined,
      });
      expect(mockProviderCreator).toHaveBeenCalledWith('gpt-4o');
    });

    it('creates Azure provider with environment variables', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      mockAzureProvider.mockReturnValue(mockModel);

      const { VercelProviderFactory } = await import('../../src/providers/vercel-factory.js');

      const provider = await VercelProviderFactory.createProvider('azure', {
        model: 'gpt-4o',
      });

      expect(provider).toBe(mockModel);
      expect(mockAzureProvider).toHaveBeenCalledWith('gpt-4o');
    });

    it('throws for unsupported provider types', async () => {
      mockVercelSDKs();

      const { VercelProviderFactory } = await import('../../src/providers/vercel-factory.js');

      await expect(VercelProviderFactory.createProvider('unsupported')).rejects.toThrow(
        'Unsupported Vercel provider: unsupported'
      );
    });

    it('shows extensible error message for planned providers', async () => {
      mockVercelSDKs();

      const { VercelProviderFactory } = await import('../../src/providers/vercel-factory.js');

      // Test that error message shows extensibility
      await expect(VercelProviderFactory.createProvider('openai')).rejects.toThrow(
        'Unsupported Vercel provider: openai. Currently supported: azure. Future support planned for: openai, google, anthropic'
      );
    });

    it('validates configuration interface supports multiple provider types', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      const mockProviderCreator = vi.fn().mockReturnValue(mockModel);
      mockCreateAzure.mockReturnValue(mockProviderCreator);
      mockAzureProvider.mockReturnValue(mockModel);

      const { VercelProviderFactory } = await import('../../src/providers/vercel-factory.js');

      // Test Azure-specific config structure
      const azureConfig = {
        model: 'gpt-4o',
        resourceName: 'test-resource',
        apiKey: 'azure-key',
      };

      const azureProvider = await VercelProviderFactory.createProvider('azure', azureConfig);
      expect(azureProvider).toBeDefined();

      // Test generic config structure
      const genericConfig = {
        model: 'gpt-4o-mini',
        baseUrl: 'https://custom.openai.com',
        timeout: 30000,
      };

      // Should work with azure even with generic config
      const genericProvider = await VercelProviderFactory.createProvider('azure', genericConfig);
      expect(genericProvider).toBeDefined();

      // Test extensible config (unknown properties allowed)
      const extensibleConfig = {
        model: 'gpt-4o',
        customProperty: 'custom-value',
        anotherCustomField: 123,
      };

      const extensibleProvider = await VercelProviderFactory.createProvider(
        'azure',
        extensibleConfig
      );
      expect(extensibleProvider).toBeDefined();
    });
  });

  describe('Integration with existing provider system', () => {
    it('maintains compatibility with IAssistantChat interface', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      mockAzureProvider.mockReturnValue(mockModel);

      const { VercelAssistantChat } = await import('../../src/providers/vercel.js');

      const provider = await VercelAssistantChat.create('azure', {
        model: 'gpt-4o',
      });

      // These properties are required by IAssistantChat
      expect(typeof provider.getType).toBe('function');
      expect(typeof provider.sendQuery).toBe('function');

      // Test that sendQuery method returns an async generator
      const queryResult = provider.sendQuery('test', '/tmp');

      expect(typeof queryResult[Symbol.asyncIterator]).toBe('function');
    });

    it('works with the provider factory pattern used in main codebase', async () => {
      mockVercelSDKs();

      const mockModel = createMockLanguageModel('gpt-4o');
      mockAzureProvider.mockReturnValue(mockModel);

      // Simulate how providers are loaded in the main system
      const { VercelProviderFactory } = await import('../../src/providers/vercel-factory.js');
      const { VercelAssistantChat } = await import('../../src/providers/vercel.js');

      // Test factory creates compatible instances
      const languageModel = await VercelProviderFactory.createProvider('azure', {
        model: 'gpt-4o',
      });

      // Test provider wrapper works with factory output
      const provider = await VercelAssistantChat.create('azure', {
        model: 'gpt-4o',
      });

      expect(languageModel).toBeDefined();
      expect(provider).toBeDefined();
      expect(provider.getType()).toBe('vercel-azure');
    });
  });
});
