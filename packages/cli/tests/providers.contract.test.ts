import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
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
  mock.module('@openai/codex-sdk', () => ({
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

  mock.module('@anthropic-ai/claude-agent-sdk', () => ({
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
    mock.restore();
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
});
