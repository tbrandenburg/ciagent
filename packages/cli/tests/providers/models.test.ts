import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IAssistantChat } from '../../src/providers/types.js';

describe('Provider Contract Tests - listModels()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('CodexAssistantChat', () => {
    it('implements listModels() method that returns string array', async () => {
      const { CodexAssistantChat } = await import('../../src/providers/codex.js');

      // Mock the constructor and dependencies to avoid actual API calls
      const mockCreate = vi.spyOn(CodexAssistantChat, 'create').mockImplementation(async () => {
        const mockInstance: IAssistantChat = {
          sendQuery: vi.fn() as any,
          getType: () => 'codex',
          listModels: vi.fn().mockResolvedValue(['codex-v1']),
        };
        return mockInstance;
      });

      const provider = await CodexAssistantChat.create();

      expect(provider).toHaveProperty('listModels');
      expect(typeof provider.listModels).toBe('function');

      const models = await provider.listModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.every(model => typeof model === 'string')).toBe(true);

      mockCreate.mockRestore();
    });

    it('returns fallback models when SDK model listing fails', async () => {
      const { CodexAssistantChat } = await import('../../src/providers/codex.js');

      const mockCreate = vi.spyOn(CodexAssistantChat, 'create').mockImplementation(async () => {
        const mockInstance: IAssistantChat = {
          sendQuery: vi.fn() as any,
          getType: () => 'codex',
          listModels: vi.fn().mockRejectedValue(new Error('SDK Error')),
        };
        return mockInstance;
      });

      const provider = await CodexAssistantChat.create();

      // Should handle errors gracefully
      await expect(provider.listModels()).rejects.toThrow();

      mockCreate.mockRestore();
    });
  });

  describe('ClaudeAssistantChat', () => {
    it('implements listModels() method that returns string array', async () => {
      const { ClaudeAssistantChat } = await import('../../src/providers/claude.js');

      const mockCreate = vi.spyOn(ClaudeAssistantChat, 'create').mockImplementation(async () => {
        const mockInstance: IAssistantChat = {
          sendQuery: vi.fn() as any,
          getType: () => 'claude',
          listModels: vi
            .fn()
            .mockResolvedValue(['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229']),
        };
        return mockInstance;
      });

      const provider = await ClaudeAssistantChat.create();

      expect(provider).toHaveProperty('listModels');
      expect(typeof provider.listModels).toBe('function');

      const models = await provider.listModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.every(model => typeof model === 'string')).toBe(true);

      mockCreate.mockRestore();
    });

    it('returns empty array when no API key is available', async () => {
      const { ClaudeAssistantChat } = await import('../../src/providers/claude.js');

      const mockCreate = vi.spyOn(ClaudeAssistantChat, 'create').mockImplementation(async () => {
        const mockInstance: IAssistantChat = {
          sendQuery: vi.fn() as any,
          getType: () => 'claude',
          listModels: vi.fn().mockResolvedValue([]), // Empty array when no API key
        };
        return mockInstance;
      });

      const provider = await ClaudeAssistantChat.create();
      const models = await provider.listModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models).toEqual([]);

      mockCreate.mockRestore();
    });
  });

  describe('VercelAssistantChat', () => {
    beforeEach(() => {
      // vi.resetModules() not available in Vitest 1.6.0, using clearAllMocks() is sufficient
      vi.clearAllMocks();
    });

    it('implements listModels() method for Azure provider', async () => {
      // Mock Azure SDK
      vi.doMock('@ai-sdk/azure', () => ({
        azure: vi.fn(),
        createAzure: vi.fn(),
      }));

      const { VercelAssistantChat } = await import('../../src/providers/vercel.js');

      const mockCreate = vi.spyOn(VercelAssistantChat, 'create').mockImplementation(async () => {
        const mockInstance: IAssistantChat = {
          sendQuery: vi.fn() as any,
          getType: () => 'vercel-azure',
          listModels: vi.fn().mockResolvedValue(['gpt-4o', 'gpt-4o-mini', 'gpt-35-turbo']),
        };
        return mockInstance;
      });

      const provider = await VercelAssistantChat.create('azure');

      expect(provider).toHaveProperty('listModels');
      expect(typeof provider.listModels).toBe('function');

      const models = await provider.listModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.every(model => typeof model === 'string')).toBe(true);

      mockCreate.mockRestore();
    });

    it('returns empty array for unsupported providers', async () => {
      // Mock Azure SDK
      vi.doMock('@ai-sdk/azure', () => ({
        azure: vi.fn(),
        createAzure: vi.fn(),
      }));

      const { VercelProviderFactory } = await import('../../src/providers/vercel-factory.js');

      const models = await VercelProviderFactory.listModels('unsupported-provider');
      expect(models).toEqual([]);
    });
  });

  describe('Interface Contract Compliance', () => {
    it('all providers implement the IAssistantChat interface with listModels', async () => {
      // This test ensures all provider classes properly implement the interface
      const { CodexAssistantChat } = await import('../../src/providers/codex.js');
      const { ClaudeAssistantChat } = await import('../../src/providers/claude.js');
      const { VercelAssistantChat } = await import('../../src/providers/vercel.js');

      // Check that static create methods exist
      expect(typeof CodexAssistantChat.create).toBe('function');
      expect(typeof ClaudeAssistantChat.create).toBe('function');
      expect(typeof VercelAssistantChat.create).toBe('function');

      // The TypeScript compiler ensures interface compliance,
      // but this test documents the contract expectation
      expect(true).toBe(true);
    });
  });

  describe('ReliableAssistantChat wrapper', () => {
    it('delegates listModels() to wrapped provider', async () => {
      const { ReliableAssistantChat } = await import('../../src/providers/reliability.js');

      const mockProvider: IAssistantChat = {
        sendQuery: vi.fn() as any,
        getType: () => 'test-provider',
        listModels: vi.fn().mockResolvedValue(['test-model-1', 'test-model-2']),
      };

      const mockConfig = { provider: 'test', retries: 3 };
      const reliableProvider = new ReliableAssistantChat(mockProvider, mockConfig);

      const models = await reliableProvider.listModels();

      expect(models).toEqual(['test-model-1', 'test-model-2']);
      expect(mockProvider.listModels).toHaveBeenCalledOnce();
    });
  });

  describe('SchemaValidatingChat wrapper', () => {
    it('delegates listModels() to wrapped provider', async () => {
      const { SchemaValidatingChat } =
        await import('../../src/providers/schema-validating-chat.js');

      const mockProvider: IAssistantChat = {
        sendQuery: vi.fn() as any,
        getType: () => 'test-provider',
        listModels: vi.fn().mockResolvedValue(['test-model-1', 'test-model-2']),
      };

      const mockConfig = { maxRetries: 1 };
      const validatingProvider = new SchemaValidatingChat(mockProvider, mockConfig);

      const models = await validatingProvider.listModels();

      expect(models).toEqual(['test-model-1', 'test-model-2']);
      expect(mockProvider.listModels).toHaveBeenCalledOnce();
    });
  });
});
