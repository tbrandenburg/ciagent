import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReliableAssistantChat } from '../src/providers/reliability.js';
import type { IAssistantChat, ChatChunk } from '../src/providers/types.js';
import type { CIAConfig } from '../src/shared/config/loader.js';

// Mock provider for testing
class MockProvider implements IAssistantChat {
  private chunks: ChatChunk[] = [];
  private shouldThrow: boolean = false;
  private throwMessage: string = 'Mock error';
  private throwCount: number = 0;
  private throwAfter: number = 0;
  private currentCall: number = 0;

  setChunks(chunks: ChatChunk[]): void {
    this.chunks = chunks;
  }

  setShouldThrow(should: boolean, message = 'Mock error', failFirstNCalls = Infinity): void {
    this.shouldThrow = should;
    this.throwMessage = message;
    this.throwAfter = failFirstNCalls;
    this.throwCount = 0;
    this.currentCall = 0;
  }

  async *sendQuery(
    _prompt: string,
    _cwd: string,
    _resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    this.currentCall++;

    if (this.shouldThrow && this.currentCall <= this.throwAfter) {
      this.throwCount++;
      throw new Error(this.throwMessage);
    }

    for (const chunk of this.chunks) {
      yield chunk;
    }
  }

  getType(): string {
    return 'mock-provider';
  }

  getCallCount(): number {
    return this.currentCall;
  }

  getThrowCount(): number {
    return this.throwCount;
  }
}

describe('ReliableAssistantChat', () => {
  let mockProvider: MockProvider;
  let config: CIAConfig;
  let reliableProvider: ReliableAssistantChat;

  beforeEach(() => {
    mockProvider = new MockProvider();
    config = {
      retries: 3,
      'retry-backoff': true,
      'retry-timeout': 5000,
      'contract-validation': false,
    };
    reliableProvider = new ReliableAssistantChat(mockProvider, config);
  });

  afterEach(() => {
    // Reset mock provider state
  });

  describe('Basic Functionality', () => {
    it('should pass through successful responses', async () => {
      const expectedChunks: ChatChunk[] = [
        { type: 'assistant', content: 'Hello' },
        { type: 'result', content: 'Done', sessionId: 'session-123' },
      ];
      mockProvider.setChunks(expectedChunks);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(expectedChunks);
      expect(mockProvider.getCallCount()).toBe(1);
    });

    it('should return provider type with reliable prefix', () => {
      expect(reliableProvider.getType()).toBe('reliable-mock-provider');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient failures', async () => {
      mockProvider.setShouldThrow(true, 'Network timeout', 2); // Fail first 2 calls, succeed on 3rd
      mockProvider.setChunks([{ type: 'assistant', content: 'Success after retry' }]);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('Success after retry');
      expect(mockProvider.getCallCount()).toBe(3); // 3rd attempt succeeds
    });

    it('should exhaust retries and return error', async () => {
      mockProvider.setShouldThrow(true, 'Persistent failure'); // Always fail

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
      expect(mockProvider.getCallCount()).toBe(4); // Original + 3 retries = 4 total
    }, 15000); // 15 second timeout

    it('should not retry authentication errors', async () => {
      mockProvider.setShouldThrow(true, 'Authentication failed - 401 unauthorized');

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].content).toContain("Provider 'reliable-mock-provider' reliability issue");
      expect(mockProvider.getCallCount()).toBe(1); // Should not retry
    }, 10000);

    it('should not retry 404 errors', async () => {
      mockProvider.setShouldThrow(true, 'Resource not found - 404');

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(mockProvider.getCallCount()).toBe(1); // Should not retry
    }, 10000);

    it('should respect retry configuration', async () => {
      config.retries = 1; // Only 1 retry
      reliableProvider = new ReliableAssistantChat(mockProvider, config);
      mockProvider.setShouldThrow(true, 'Persistent failure');

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks[0].content).toContain('Provider failed after 1 retry attempts');
      expect(mockProvider.getCallCount()).toBe(2); // Original + 1 retry = 2 total
    });
  });

  describe('Contract Validation', () => {
    beforeEach(() => {
      config['contract-validation'] = true;
      reliableProvider = new ReliableAssistantChat(mockProvider, config);
    });

    it('should validate chunk types when enabled', async () => {
      const invalidChunk = { type: 'invalid-type' as ChatChunk['type'], content: 'Invalid' };
      mockProvider.setChunks([invalidChunk]);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].content).toContain("Provider 'reliable-mock-provider' reliability issue");
      expect(mockProvider.getCallCount()).toBe(1); // Should not retry contract violations
    });

    it('should validate result chunk sessionId when enabled', async () => {
      const invalidResult: ChatChunk = { type: 'result', content: 'Done' }; // Missing sessionId
      mockProvider.setChunks([invalidResult]);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(mockProvider.getCallCount()).toBe(1); // Should not retry contract violations
    });

    it('should pass valid contracts', async () => {
      const validChunks: ChatChunk[] = [
        { type: 'assistant', content: 'Hello' },
        { type: 'result', content: 'Done', sessionId: 'valid-session-123' },
      ];
      mockProvider.setChunks(validChunks);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(validChunks);
      expect(mockProvider.getCallCount()).toBe(1);
    });
  });

  describe('Error Normalization', () => {
    it('should handle provider error chunks', async () => {
      const errorChunk: ChatChunk = { type: 'error', content: 'Provider internal error' };
      mockProvider.setChunks([errorChunk]);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
      expect(mockProvider.getCallCount()).toBe(4); // Should retry error chunks (original + 3 retries)
    }, 15000);

    it('should handle different error types appropriately', async () => {
      const testCases = [
        { error: 'authentication failed', shouldRetry: false },
        { error: 'unauthorized access', shouldRetry: false },
        { error: 'not found', shouldRetry: false },
        { error: 'network timeout', shouldRetry: true },
        { error: 'connection refused', shouldRetry: true },
      ];

      for (const testCase of testCases) {
        mockProvider = new MockProvider();
        reliableProvider = new ReliableAssistantChat(mockProvider, config);
        mockProvider.setShouldThrow(true, testCase.error);

        const chunks: ChatChunk[] = [];
        for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
          chunks.push(chunk);
        }

        if (testCase.shouldRetry) {
          expect(mockProvider.getCallCount()).toBe(4); // Should exhaust retries (original + 3)
          expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
        } else {
          expect(mockProvider.getCallCount()).toBe(1); // Should not retry
          expect(chunks[0].content).toContain(
            "Provider 'reliable-mock-provider' reliability issue"
          );
        }
      }
    }, 20000);
  });

  describe('Configuration Integration', () => {
    it('should disable retries when retries is 0', async () => {
      config.retries = 0;
      reliableProvider = new ReliableAssistantChat(mockProvider, config);
      mockProvider.setShouldThrow(true, 'Network error');

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(mockProvider.getCallCount()).toBe(1); // Only original attempt, no retries
      expect(chunks[0].content).toContain('Provider failed after 0 retry attempts');
    });

    it('should work with contract validation disabled', async () => {
      config['contract-validation'] = false;
      reliableProvider = new ReliableAssistantChat(mockProvider, config);

      // This would normally fail validation but should pass through
      const invalidChunk = { type: 'invalid-type' as ChatChunk['type'], content: 'Invalid' };
      mockProvider.setChunks([invalidChunk]);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([invalidChunk]); // Should pass through without validation
      expect(mockProvider.getCallCount()).toBe(1);
    });
  });
});
