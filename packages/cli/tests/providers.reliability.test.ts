import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReliableAssistantChat } from '../src/providers/reliability.js';
import type { IAssistantChat, ChatChunk, Message } from '../src/providers/types.js';
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
    _input: string | Message[],
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

  async listModels(): Promise<string[]> {
    return ['mock-model'];
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
    // Fast configuration for tests - preserves retry logic but with minimal delays
    config = {
      retries: 3,
      'retry-backoff': false, // Disable exponential backoff in tests
      'retry-timeout': 1000, // Reduce max timeout from 5000ms to 1000ms
      'contract-validation': false,
    };
    reliableProvider = new ReliableAssistantChat(mockProvider, config);
  });

  afterEach(() => {
    // Reset mock provider state
    mockProvider.setShouldThrow(false);
    mockProvider.setChunks([]);
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

    it('should stop retries when a non-retryable error follows a transient error', async () => {
      let callCount = 0;
      const mixedFailureProvider: IAssistantChat = {
        async *sendQuery(
          _input: string | Message[],
          _cwd: string,
          _resumeSessionId?: string
        ): AsyncGenerator<ChatChunk> {
          callCount++;
          if (callCount === 1) {
            throw new Error('Network timeout');
          }
          if (callCount === 2) {
            throw new Error('Authentication failed - 401 unauthorized');
          }

          yield { type: 'assistant', content: 'should not be reached' };
        },
        getType: () => 'mixed-failure-provider',
        listModels: async () => ['test-model'],
      };

      const mixedReliableProvider = new ReliableAssistantChat(mixedFailureProvider, {
        retries: 3,
        'retry-backoff': false,
        'retry-timeout': 1000,
        'contract-validation': false,
      });

      const startTime = Date.now();
      const chunks: ChatChunk[] = [];
      for await (const chunk of mixedReliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }
      const duration = Date.now() - startTime;

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].content).toContain(
        "Provider 'reliable-mixed-failure-provider' reliability issue"
      );
      expect(callCount).toBe(2);
      expect(duration).toBeLessThan(3000);
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

    describe('Error Type Handling', () => {
      it('should not retry authentication errors', async () => {
        mockProvider.setShouldThrow(true, 'authentication failed');

        const chunks: ChatChunk[] = [];
        for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
          chunks.push(chunk);
        }

        expect(mockProvider.getCallCount()).toBe(1); // Should not retry
        expect(chunks[0].content).toContain("Provider 'reliable-mock-provider' reliability issue");
      });

      it('should not retry unauthorized errors', async () => {
        mockProvider.setShouldThrow(true, 'unauthorized access');

        const chunks: ChatChunk[] = [];
        for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
          chunks.push(chunk);
        }

        expect(mockProvider.getCallCount()).toBe(1);
        expect(chunks[0].content).toContain("Provider 'reliable-mock-provider' reliability issue");
      });

      it('should not retry not found errors', async () => {
        mockProvider.setShouldThrow(true, 'not found');

        const chunks: ChatChunk[] = [];
        for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
          chunks.push(chunk);
        }

        expect(mockProvider.getCallCount()).toBe(1);
        expect(chunks[0].content).toContain("Provider 'reliable-mock-provider' reliability issue");
      });

      it('should retry network timeout errors', async () => {
        mockProvider.setShouldThrow(true, 'network timeout');

        const chunks: ChatChunk[] = [];
        for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
          chunks.push(chunk);
        }

        expect(mockProvider.getCallCount()).toBe(4); // Should exhaust retries (original + 3)
        expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
      });

      it('should retry connection refused errors', async () => {
        mockProvider.setShouldThrow(true, 'connection refused');

        const chunks: ChatChunk[] = [];
        for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
          chunks.push(chunk);
        }

        expect(mockProvider.getCallCount()).toBe(4); // Should exhaust retries (original + 3)
        expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
      });
    });
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

  describe('Test Environment Optimization', () => {
    it('should complete retry cycles quickly with disabled backoff', async () => {
      const startTime = Date.now();
      mockProvider.setShouldThrow(true, 'network timeout');

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery('test prompt', '/tmp')) {
        chunks.push(chunk);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000); // Should complete in under 3 seconds
      expect(mockProvider.getCallCount()).toBe(4); // Still does full retry cycle
      expect(chunks[0].content).toContain('Provider failed after 3 retry attempts');
    });
  });

  describe('reliability with Message[] inputs', () => {
    it('handles empty Message[] gracefully', async () => {
      const emptyMessages: Message[] = [];
      mockProvider.setChunks([
        { type: 'assistant', content: 'Handled empty messages' },
        { type: 'result', sessionId: 'test-session' },
      ]);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery(emptyMessages, '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('Handled empty messages');
      expect(mockProvider.getCallCount()).toBe(1);
    });

    it('handles malformed Message objects', async () => {
      const malformed = [{ role: 'invalid', content: 'test' }] as unknown as Message[];
      mockProvider.setChunks([
        { type: 'assistant', content: 'Processed malformed input' },
        { type: 'result', sessionId: 'test-session' },
      ]);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery(malformed, '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].content).toBe('Processed malformed input');
      expect(mockProvider.getCallCount()).toBe(1);
    });

    it('retries Message[] inputs on failures', async () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];

      mockProvider.setShouldThrow(true, 'Network timeout', 2); // Fail first 2 calls
      mockProvider.setChunks([
        { type: 'assistant', content: 'Success with Messages after retry' },
        { type: 'result', sessionId: 'retry-session' },
      ]);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery(messages, '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toBe('Success with Messages after retry');
      expect(mockProvider.getCallCount()).toBe(3); // 3rd attempt succeeds
    });

    it('validates Message[] inputs with contract validation enabled', async () => {
      config['contract-validation'] = true;
      reliableProvider = new ReliableAssistantChat(mockProvider, config);

      const messages: Message[] = [{ role: 'user', content: 'Test message' }];

      const validChunks: ChatChunk[] = [
        { type: 'assistant', content: 'Valid response' },
        { type: 'result', sessionId: 'valid-session-id' },
      ];
      mockProvider.setChunks(validChunks);

      const chunks: ChatChunk[] = [];
      for await (const chunk of reliableProvider.sendQuery(messages, '/tmp')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(validChunks);
      expect(mockProvider.getCallCount()).toBe(1);
    });
  });
});
