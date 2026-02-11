import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ChatChunk } from '../src/providers/types.js';

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

    expect(codex.getType()).toBe('codex');
    expect(claude.getType()).toBe('claude');
    await expect(createAssistantChat('unsupported')).rejects.toThrow('Unsupported provider');
  });

  it('both providers emit only allowed chunk types and result carries sessionId', async () => {
    mockProviderSdks();
    const { createAssistantChat } = await import('../src/providers/index.js');

    const codex = await createAssistantChat('codex');
    const claude = await createAssistantChat('claude');

    const codexChunks = await collectChunks(codex.sendQuery('prompt', '/tmp'));
    const claudeChunks = await collectChunks(claude.sendQuery('prompt', '/tmp'));

    for (const chunk of [...codexChunks, ...claudeChunks]) {
      expect(ALLOWED_CHUNK_TYPES.has(chunk.type)).toBe(true);
    }

    const codexResult = codexChunks.find(chunk => chunk.type === 'result');
    const claudeResult = claudeChunks.find(chunk => chunk.type === 'result');

    expect(codexResult?.sessionId).toBeTruthy();
    expect(claudeResult?.sessionId).toBeTruthy();
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
});
