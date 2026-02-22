import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'fs';
import type { ChatChunk } from '../../src/providers/types.js';
import * as providers from '../../src/providers/index.js';
import { mcpProvider } from '../../src/providers/mcp.js';
import { runCommand } from '../../src/commands/run.js';

function makeGenerator(chunks: ChatChunk[]): AsyncGenerator<ChatChunk> {
  return (async function* generate() {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

describe('runCommand', () => {
  const testOutputDir = '/tmp/cia-run-command-tests';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  it('returns success when assistant content is produced', async () => {
    const mockAssistantChat = {
      sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
      getType: () => 'codex',
      listModels: vi.fn().mockResolvedValue(['codex-v1']),
    };

    const createAssistantChatSpy = vi
      .spyOn(providers, 'createAssistantChat')
      .mockResolvedValue(mockAssistantChat);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await runCommand(['hello'], { provider: 'codex' });

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('ok');
    expect(createAssistantChatSpy).toHaveBeenCalledWith('codex', { provider: 'codex' });

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('returns execution failure on provider error chunk', async () => {
    const mockAssistantChat = {
      sendQuery: () => makeGenerator([{ type: 'error', content: 'turn failed' }]),
      getType: () => 'codex',
      listModels: vi.fn().mockResolvedValue(['codex-v1']),
    };

    const createAssistantChatSpy = vi
      .spyOn(providers, 'createAssistantChat')
      .mockResolvedValue(mockAssistantChat);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await runCommand(['hello'], { provider: 'codex' });

    expect(exitCode).toBe(4);
    expect(logSpy).not.toHaveBeenCalledWith('turn failed');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AI execution failed'));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('does not misclassify provider error chunks containing timeout wording as timeout', async () => {
    const mockAssistantChat = {
      sendQuery: () =>
        makeGenerator([
          {
            type: 'error',
            content: 'Provider timeout policy rejected this request as invalid.',
          },
        ]),
      getType: () => 'codex',
      listModels: vi.fn().mockResolvedValue(['codex-v1']),
    };

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await runCommand(['hello'], { provider: 'codex' });

    expect(exitCode).toBe(4);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AI execution failed'));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Operation timed out'));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prints actionable provider detail when error chunk includes reliability + detail text', async () => {
    const mockAssistantChat = {
      sendQuery: () =>
        makeGenerator([
          {
            type: 'error',
            content:
              'Provider failed after 1 retry attempts: The model `gpt-5.3-codex` does not exist or you do not have access to it.',
          },
        ]),
      getType: () => 'reliable-codex',
      listModels: vi.fn().mockResolvedValue(['codex-v1']),
    };

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await runCommand(['hello'], { provider: 'codex' });

    expect(exitCode).toBe(4);
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('does not exist or you do not have access')
    );
    expect(
      errorSpy.mock.calls.some(
        call =>
          typeof call[0] === 'string' &&
          call[0].includes(
            'The model `gpt-5.3-codex` does not exist or you do not have access to it.'
          )
      )
    ).toBe(true);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('writes structured output file when output-file is configured', async () => {
    const mockAssistantChat = {
      sendQuery: () => makeGenerator([{ type: 'assistant', content: '{"ok":true}' }]),
      getType: () => 'codex',
      listModels: vi.fn().mockResolvedValue(['codex-v1']),
    };

    const createAssistantChatSpy = vi
      .spyOn(providers, 'createAssistantChat')
      .mockResolvedValue(mockAssistantChat);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const outputFile = `${testOutputDir}/result.json`;
    const config = {
      provider: 'codex',
      'output-file': outputFile,
      'output-format': 'json' as const,
    };

    const exitCode = await runCommand(['hello'], config);

    expect(exitCode).toBe(0);
    expect(existsSync(outputFile)).toBe(true);

    const content = readFileSync(outputFile, 'utf8');
    const written = JSON.parse(content);

    expect(written.success).toBe(true);
    expect(written.response).toEqual({ ok: true });
    expect(written.metadata.runner).toBe('cia');

    logSpy.mockRestore();
  });

  describe('Status Message Integration', () => {
    it('should display MCP and Skills status when available', async () => {
      const mockAssistantChat = {
        sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
        getType: () => 'codex',
        listModels: vi.fn().mockResolvedValue(['codex-v1']),
      };

      const createAssistantChatSpy = vi
        .spyOn(providers, 'createAssistantChat')
        .mockResolvedValue(mockAssistantChat);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const exitCode = await runCommand(['hello'], {
        provider: 'codex',
        verbose: true,
        skill: 'test-skill',
        skills: { paths: ['/test/skills'] },
      });

      expect(exitCode).toBe(0);
      expect(logSpy).toHaveBeenCalledWith('ok');
      expect(createAssistantChatSpy).toHaveBeenCalledWith('codex', {
        provider: 'codex',
        verbose: true,
        skill: 'test-skill',
        skills: { paths: ['/test/skills'] },
      });

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should handle MCP initialization failure gracefully', async () => {
      const mockAssistantChat = {
        sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
        getType: () => 'codex',
        listModels: vi.fn().mockResolvedValue(['codex-v1']),
      };

      const createAssistantChatSpy = vi
        .spyOn(providers, 'createAssistantChat')
        .mockResolvedValue(mockAssistantChat);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const exitCode = await runCommand(['hello'], { provider: 'codex', verbose: true });

      expect(exitCode).toBe(0);

      // Should still show assistant response even if status fails
      expect(logSpy).toHaveBeenCalledWith('ok');

      // Should have attempted to show status
      const logCalls = logSpy.mock.calls.map(call => call[0]);
      expect(logCalls.some(call => typeof call === 'string' && call.includes('[Status]'))).toBe(
        true
      );

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should show no enhanced capabilities when none configured', async () => {
      const mockAssistantChat = {
        sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
        getType: () => 'codex',
        listModels: vi.fn().mockResolvedValue(['codex-v1']),
      };

      const createAssistantChatSpy = vi
        .spyOn(providers, 'createAssistantChat')
        .mockResolvedValue(mockAssistantChat);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const exitCode = await runCommand(['hello'], { provider: 'codex', verbose: true });

      expect(exitCode).toBe(0);

      // Should show no enhanced capabilities message
      const logCalls = logSpy.mock.calls.map(call => call[0]);
      expect(
        logCalls.some(
          call =>
            typeof call === 'string' && call.includes('[Status] No enhanced capabilities available')
        )
      ).toBe(true);

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Timeout and Resilience', () => {
    describe('Timeout budget boundaries', () => {
      it('does not consume timeout budget during provider setup delay', async () => {
        const mockAssistantChat = {
          sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
          getType: () => 'codex',
          listModels: vi.fn().mockResolvedValue(['codex-v1']),
        };

        vi.spyOn(providers, 'createAssistantChat').mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 80));
          return mockAssistantChat;
        });

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const exitCode = await runCommand(['hello'], { provider: 'codex', timeout: 0.05 });

        expect(exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledWith('ok');

        logSpy.mockRestore();
        errorSpy.mockRestore();
      });

      it('does not block prompt execution on slow status emission', async () => {
        const mockAssistantChat = {
          sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
          getType: () => 'codex',
          listModels: vi.fn().mockResolvedValue(['codex-v1']),
        };

        vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
        vi.spyOn(mcpProvider, 'initialize').mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 120));
        });

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const startedAt = Date.now();
        const exitCode = await runCommand(['hello'], { provider: 'codex', timeout: 0.05 });
        const elapsedMs = Date.now() - startedAt;

        expect(exitCode).toBe(0);
        expect(logSpy).toHaveBeenCalledWith('ok');
        expect(elapsedMs).toBeLessThan(100);

        logSpy.mockRestore();
        errorSpy.mockRestore();
      });
    });

    it('returns timeout exit code when provider stalls before next yield', async () => {
      const mockAssistantChat = {
        sendQuery: () =>
          (async function* stalledAfterFirstChunk() {
            yield { type: 'assistant', content: 'partial' } as ChatChunk;
            await new Promise(() => undefined);
          })(),
        getType: () => 'codex',
        listModels: vi.fn().mockResolvedValue(['codex-v1']),
      };

      vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const exitCode = await runCommand(['hello'], { provider: 'codex', timeout: 0.02 });

      expect(exitCode).toBe(5);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Operation timed out'));

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('does not timeout when next chunk arrives within overall timeout', async () => {
      const mockAssistantChat = {
        sendQuery: () =>
          (async function* delayedSecondChunk() {
            yield { type: 'assistant', content: 'first' } as ChatChunk;
            await new Promise(resolve => setTimeout(resolve, 30));
            yield { type: 'assistant', content: 'second' } as ChatChunk;
          })(),
        getType: () => 'codex',
        listModels: vi.fn().mockResolvedValue(['codex-v1']),
      };

      vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const exitCode = await runCommand(['hello'], { provider: 'codex', timeout: 0.2 });

      expect(exitCode).toBe(0);
      expect(logSpy).toHaveBeenCalledWith('first');
      expect(logSpy).toHaveBeenCalledWith('second');

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('returns timeout exit code when provider never yields', async () => {
      const mockAssistantChat = {
        sendQuery: () =>
          (async function* neverYields() {
            await new Promise(() => undefined);
          })(),
        getType: () => 'codex',
        listModels: vi.fn().mockResolvedValue(['codex-v1']),
      };

      vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const exitCode = await runCommand(['hello'], { provider: 'codex', timeout: 0.02 });

      expect(exitCode).toBe(5);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Operation timed out'));

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('fails loudly when assistant output exceeds configured cap', async () => {
      const largeChunk = 'x'.repeat(1024 * 1024 + 1);
      const mockAssistantChat = {
        sendQuery: () => makeGenerator([{ type: 'assistant', content: largeChunk }]),
        getType: () => 'codex',
        listModels: vi.fn().mockResolvedValue(['codex-v1']),
      };

      vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const exitCode = await runCommand(['hello'], { provider: 'codex' });

      expect(exitCode).toBe(4);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Assistant output exceeded maximum size')
      );

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
