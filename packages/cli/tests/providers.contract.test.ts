import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ChatChunk, Message } from '../src/providers/types.js';

const ALLOWED_CHUNK_TYPES = new Set<ChatChunk['type']>([
  'assistant',
  'result',
  'system',
  'tool',
  'thinking',
  'error',
]);

const testHome = '/tmp/cia-provider-contract-tests';
const originalHome = process.env.HOME;

function mockProviderSdks(): void {
  vi.mock('@openai/codex-sdk', () => ({
    Codex: class {
      startThread() {
        return {
          id: 'codex-session-123',
          runStreamed: async () => ({
            events: (async function* () {
              yield { type: 'item.completed', item: { type: 'agent_message', text: 'hello' } };
              yield { type: 'item.completed', item: { type: 'command_execution', command: 'ls' } };
              yield { type: 'item.completed', item: { type: 'reasoning', text: 'thinking' } };
              yield { type: 'turn.completed' };
            })(),
          }),
        };
      }

      resumeThread(sessionId: string) {
        return {
          id: sessionId,
          runStreamed: async () => ({ events: (async function* () {})() }),
        };
      }
    },
  }));

  vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
    query: () =>
      (async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'hello from claude' },
              { type: 'tool_use', name: 'bash' },
            ],
          },
        };
        yield { type: 'result', session_id: 'claude-session-456' };
      })(),
  }));

  // Mock Vercel AI SDK with generic pattern that works for any provider
  vi.mock('ai', () => ({
    streamText: async ({ model, prompt }: { model: any; prompt: string }) => {
      // Mock response format same across all Vercel providers
      return {
        textStream: (async function* () {
          yield 'hello from ';
          yield `vercel ${model?.providerId || 'azure'}`;
          yield ' provider';
        })(),
      };
    },
  }));

  // Mock Azure provider (first concrete example)
  vi.mock('@ai-sdk/azure', () => ({
    azure: (model: string) => ({
      providerId: 'azure',
      modelId: model,
    }),
    createAzure: (config: any) => {
      return (model: string) => ({
        providerId: 'azure',
        modelId: model,
        config,
      });
    },
  }));
}

async function collectChunks(generator: AsyncGenerator<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('providers contract', () => {
  beforeEach(() => {
    rmSync(testHome, { recursive: true, force: true });
    mkdirSync(join(testHome, '.codex'), { recursive: true });
    writeFileSync(
      join(testHome, '.codex', 'auth.json'),
      JSON.stringify({
        tokens: {
          id_token: 'test-id-token',
          access_token: 'test-access-token',
        },
      })
    );
    process.env.HOME = testHome;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(testHome, { recursive: true, force: true });
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it('factory returns supported providers and rejects unsupported', async () => {
    mockProviderSdks();
    const { createAssistantChat } = await import('../src/providers/index.js');

    const codex = await createAssistantChat('codex');
    const claude = await createAssistantChat('claude');
    const azure = await createAssistantChat('azure');

    expect(codex.getType()).toBe('codex');
    expect(claude.getType()).toBe('claude');
    expect(azure.getType()).toBe('vercel-azure');
    await expect(createAssistantChat('unsupported')).rejects.toThrow('Unsupported provider');
  });

  it('all providers emit only allowed chunk types and result carries sessionId', async () => {
    mockProviderSdks();
    const { createAssistantChat } = await import('../src/providers/index.js');

    const codex = await createAssistantChat('codex');
    const claude = await createAssistantChat('claude');
    const azure = await createAssistantChat('azure');

    const codexChunks = await collectChunks(codex.sendQuery('prompt', '/tmp'));
    const claudeChunks = await collectChunks(claude.sendQuery('prompt', '/tmp'));
    const azureChunks = await collectChunks(azure.sendQuery('prompt', '/tmp'));

    for (const chunk of [...codexChunks, ...claudeChunks, ...azureChunks]) {
      expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
    }

    const codexResult = codexChunks.find(chunk => chunk.type === 'result');
    const claudeResult = claudeChunks.find(chunk => chunk.type === 'result');
    const azureResult = azureChunks.find(chunk => chunk.type === 'result');

    const codexTypes = new Set(codexChunks.map(chunk => chunk.type));
    const claudeTypes = new Set(claudeChunks.map(chunk => chunk.type));
    const azureTypes = new Set(azureChunks.map(chunk => chunk.type));

    expect(codexTypes).toEqual(new Set(['assistant', 'tool', 'thinking', 'result']));
    expect(claudeTypes).toEqual(new Set(['assistant', 'tool', 'result']));
    expect(azureTypes).toEqual(new Set(['assistant', 'result']));

    expect(codexResult?.sessionId).toBeTruthy();
    expect(claudeResult?.sessionId).toBeTruthy();
    expect(azureResult?.sessionId).toBeTruthy();
  });

  describe('interface overloading support', () => {
    it('all providers support string inputs (backward compatibility)', async () => {
      mockProviderSdks();
      const { createAssistantChat } = await import('../src/providers/index.js');

      const codex = await createAssistantChat('codex');
      const claude = await createAssistantChat('claude');
      const azure = await createAssistantChat('azure');

      const codexChunks = await collectChunks(codex.sendQuery('test prompt', '/tmp'));
      const claudeChunks = await collectChunks(claude.sendQuery('test prompt', '/tmp'));
      const azureChunks = await collectChunks(azure.sendQuery('test prompt', '/tmp'));

      expect(codexChunks.length).toBeGreaterThan(0);
      expect(claudeChunks.length).toBeGreaterThan(0);
      expect(azureChunks.length).toBeGreaterThan(0);

      // Verify chunk types are still valid
      for (const chunk of [...codexChunks, ...claudeChunks, ...azureChunks]) {
        expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
      }
    });

    it('all providers support Message[] inputs (new functionality)', async () => {
      mockProviderSdks();
      const { createAssistantChat } = await import('../src/providers/index.js');

      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];

      const codex = await createAssistantChat('codex');
      const claude = await createAssistantChat('claude');
      const azure = await createAssistantChat('azure');

      const codexChunks = await collectChunks(codex.sendQuery(messages, '/tmp'));
      const claudeChunks = await collectChunks(claude.sendQuery(messages, '/tmp'));
      const azureChunks = await collectChunks(azure.sendQuery(messages, '/tmp'));

      expect(codexChunks.length).toBeGreaterThan(0);
      expect(claudeChunks.length).toBeGreaterThan(0);
      expect(azureChunks.length).toBeGreaterThan(0);

      // Verify chunk types are still valid
      for (const chunk of [...codexChunks, ...claudeChunks, ...azureChunks]) {
        expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
      }

      // Verify sessionIds are preserved
      const codexResult = codexChunks.find(chunk => chunk.type === 'result');
      const claudeResult = claudeChunks.find(chunk => chunk.type === 'result');
      const azureResult = azureChunks.find(chunk => chunk.type === 'result');

      expect(codexResult?.sessionId).toBeTruthy();
      expect(claudeResult?.sessionId).toBeTruthy();
      expect(azureResult?.sessionId).toBeTruthy();
    });
  });

  it('reliability wrapper maintains contract compliance', async () => {
    mockProviderSdks();
    const { createAssistantChat } = await import('../src/providers/index.js');
    const { ReliableAssistantChat } = await import('../src/providers/reliability.js');

    const codex = await createAssistantChat('codex');
    const config = {
      retries: 2,
      'contract-validation': true,
      'retry-backoff': true,
      'retry-timeout': 5000,
    };
    const reliableCodex = new ReliableAssistantChat(codex, config);

    const codexChunks = await collectChunks(reliableCodex.sendQuery('prompt', '/tmp'));

    // Verify all chunks still follow contract
    for (const chunk of codexChunks) {
      expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
    }

    // Verify result chunk still has sessionId
    const codexResult = codexChunks.find(chunk => chunk.type === 'result');
    expect(codexResult?.sessionId).toBeTruthy();

    // Verify provider type is wrapped correctly
    expect(reliableCodex.getType()).toBe('reliable-codex');
  });

  it('reliability wrapper preserves contract with provider config path', async () => {
    mockProviderSdks();
    const { createAssistantChat } = await import('../src/providers/index.js');
    const { ReliableAssistantChat } = await import('../src/providers/reliability.js');

    const providerConfig = {
      providers: {
        azure: {
          model: 'configured-azure-model',
          resourceName: 'configured-resource',
          apiKey: 'configured-api-key',
        },
      },
    };

    const azure = await createAssistantChat('azure', providerConfig as any);
    const reliableAzure = new ReliableAssistantChat(azure, {
      retries: 1,
      'contract-validation': true,
      'retry-backoff': false,
      'retry-timeout': 1000,
    });

    const chunks = await collectChunks(reliableAzure.sendQuery('prompt', '/tmp'));

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
    }

    expect(chunks.some(chunk => chunk.type === 'assistant')).toBe(true);
    expect(chunks.some(chunk => chunk.type === 'result' && !!chunk.sessionId)).toBe(true);
    expect(reliableAzure.getType()).toBe('reliable-vercel-azure');
  });

  it('reliability wrapper with contract validation enabled catches violations', async () => {
    const { ReliableAssistantChat } = await import('../src/providers/reliability.js');

    // Create a mock provider that violates contracts
    const mockProvider = {
      async *sendQuery() {
        yield { type: 'invalid-type' as any, content: 'Invalid chunk' };
      },
      getType: () => 'mock-violator',
    };

    const config = {
      retries: 1,
      'contract-validation': true,
      'retry-backoff': false,
      'retry-timeout': 1000,
    };
    const reliableProvider = new ReliableAssistantChat(mockProvider as any, config);

    const chunks = await collectChunks(reliableProvider.sendQuery('test', '/tmp'));

    // Should get an error chunk (contract violation is non-retryable)
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].content).toContain('reliability issue');
  });

  describe('Vercel provider extensibility', () => {
    it('generic Vercel adapter works with Azure provider', async () => {
      mockProviderSdks();
      const { createAssistantChat } = await import('../src/providers/index.js');

      const azure = await createAssistantChat('azure');
      expect(azure.getType()).toBe('vercel-azure');

      const azureChunks = await collectChunks(azure.sendQuery('test with azure', '/tmp'));

      // Should have assistant content and result
      expect(azureChunks.length).toBeGreaterThan(1);

      // Check content appears (from our mock)
      const assistantChunks = azureChunks.filter(chunk => chunk.type === 'assistant');
      const content = assistantChunks.map(chunk => chunk.content).join('');
      expect(content).toContain('vercel azure provider');

      // Check result chunk
      const resultChunk = azureChunks.find(chunk => chunk.type === 'result');
      expect(resultChunk).toBeDefined();
      expect(resultChunk?.sessionId).toBeTruthy();
    });

    it('Vercel adapter handles provider configuration', async () => {
      mockProviderSdks();
      const { createAssistantChat } = await import('../src/providers/index.js');

      // Test with custom configuration
      const config = {
        providers: {
          azure: {
            model: 'custom-model',
            resourceName: 'test-resource',
            apiKey: 'test-key',
          },
        },
      };

      const azure = await createAssistantChat('azure', config);
      expect(azure.getType()).toBe('vercel-azure');

      const azureChunks = await collectChunks(azure.sendQuery('test with config', '/tmp'));
      expect(azureChunks.length).toBeGreaterThan(0);

      // Verify all chunks follow contract
      for (const chunk of azureChunks) {
        expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
      }
    });
  });
});
