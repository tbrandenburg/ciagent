import { describe, it, expect } from 'vitest';
import { SchemaValidatingChat } from '../../src/providers/schema-validating-chat.js';
import type { IAssistantChat, ChatChunk } from '../../src/providers/types.js';
import { JSONSchema7 } from 'json-schema';

// Enhanced mock for testing retry scenarios
class SimpleProvider implements IAssistantChat {
  private chunks: ChatChunk[] = [];
  private callCount = 0;
  private maxCalls = 1;
  private responses: ChatChunk[][] = [];

  setChunks(chunks: ChatChunk[]): void {
    this.chunks = chunks;
  }

  setRetryResponses(responses: ChatChunk[][]): void {
    this.responses = responses;
    this.maxCalls = responses.length;
    this.callCount = 0;
  }

  async *sendQuery(): AsyncGenerator<ChatChunk> {
    if (this.responses.length > 0) {
      const responseIndex = Math.min(this.callCount, this.responses.length - 1);
      this.callCount++;
      for (const chunk of this.responses[responseIndex]) {
        yield chunk;
      }
    } else {
      for (const chunk of this.chunks) {
        yield chunk;
      }
    }
  }

  getType(): string {
    return 'simple-mock';
  }
}

describe('SchemaValidatingChat - Comprehensive', () => {
  it('should validate correct schema response', async () => {
    const provider = new SimpleProvider();
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    };

    const schemaChat = new SchemaValidatingChat(provider, { schema });

    provider.setChunks([{ type: 'assistant', content: '{"message": "test"}' }]);

    const chunks: ChatChunk[] = [];
    for await (const chunk of schemaChat.sendQuery('test', '/test')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('assistant');
    expect(chunks[0].content).toBe('{"message": "test"}');
  });

  it('should pass through non-assistant chunks immediately', async () => {
    const provider = new SimpleProvider();
    const schema: JSONSchema7 = { type: 'object' };
    const schemaChat = new SchemaValidatingChat(provider, { schema });

    provider.setChunks([
      { type: 'system', content: 'System message' },
      { type: 'tool', content: 'Tool message' },
    ]);

    const chunks: ChatChunk[] = [];
    for await (const chunk of schemaChat.sendQuery('test', '/test')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: 'system', content: 'System message' });
    expect(chunks[1]).toEqual({ type: 'tool', content: 'Tool message' });
  });

  it('should retry on invalid JSON and succeed on second attempt', async () => {
    const provider = new SimpleProvider();
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    };

    const schemaChat = new SchemaValidatingChat(provider, {
      schema,
      maxRetries: 2,
    });

    // First response invalid, second valid
    provider.setRetryResponses([
      [{ type: 'assistant', content: 'invalid json' }],
      [{ type: 'assistant', content: '{"message": "success"}' }],
    ]);

    const chunks: ChatChunk[] = [];
    for await (const chunk of schemaChat.sendQuery('test', '/test')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('assistant');
    expect(chunks[0].content).toBe('{"message": "success"}');
  });

  it('should retry on schema validation failure and succeed', async () => {
    const provider = new SimpleProvider();
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    };

    const schemaChat = new SchemaValidatingChat(provider, {
      schema,
      maxRetries: 2,
    });

    // First response missing required field, second valid
    provider.setRetryResponses([
      [{ type: 'assistant', content: '{"wrong": "field"}' }],
      [{ type: 'assistant', content: '{"message": "success"}' }],
    ]);

    const chunks: ChatChunk[] = [];
    for await (const chunk of schemaChat.sendQuery('test', '/test')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('{"message": "success"}');
  });

  it('should fail after max retries exceeded', async () => {
    const provider = new SimpleProvider();
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    };

    const schemaChat = new SchemaValidatingChat(provider, {
      schema,
      maxRetries: 2,
    });

    // All responses invalid
    provider.setRetryResponses([
      [{ type: 'assistant', content: 'invalid' }],
      [{ type: 'assistant', content: 'still invalid' }],
      [{ type: 'assistant', content: 'never reached' }],
    ]);

    const testPromise = async () => {
      const chunks: ChatChunk[] = [];
      for await (const chunk of schemaChat.sendQuery('test', '/test')) {
        chunks.push(chunk);
      }
    };

    await expect(testPromise()).rejects.toThrow(/Schema validation failed after 2 retries/);
  });

  it('should handle mixed chunk streams correctly', async () => {
    const provider = new SimpleProvider();
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    };

    const schemaChat = new SchemaValidatingChat(provider, { schema });

    provider.setChunks([
      { type: 'system', content: 'Start' },
      { type: 'assistant', content: '{"message": "valid"}' },
      { type: 'result', content: 'End' },
    ]);

    const chunks: ChatChunk[] = [];
    for await (const chunk of schemaChat.sendQuery('test', '/test')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: 'system', content: 'Start' });
    expect(chunks[1]).toEqual({ type: 'assistant', content: '{"message": "valid"}' });
    expect(chunks[2]).toEqual({ type: 'result', content: 'End' });
  });

  it('should work without schema validation when no schema provided', async () => {
    const provider = new SimpleProvider();
    const schemaChat = new SchemaValidatingChat(provider, {});

    provider.setChunks([{ type: 'assistant', content: 'any content' }]);

    const chunks: ChatChunk[] = [];
    for await (const chunk of schemaChat.sendQuery('test', '/test')) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('any content');
  });

  it('should preserve getType from underlying provider', () => {
    const provider = new SimpleProvider();
    const schemaChat = new SchemaValidatingChat(provider, {});
    expect(schemaChat.getType()).toBe('simple-mock');
  });
});
