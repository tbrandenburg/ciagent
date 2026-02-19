import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'fs';
import type { ChatChunk } from '../../src/providers/types.js';
import * as providers from '../../src/providers/index.js';
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
        skill: 'test-skill',
        skills: { paths: ['/test/skills'] },
      });

      expect(exitCode).toBe(0);

      // Check for status messages (order matters)
      const logCalls = logSpy.mock.calls.map(call => call[0]);

      // Should contain MCP status
      expect(
        logCalls.some(call => typeof call === 'string' && call.includes('[Status] MCP:'))
      ).toBe(true);

      // Should contain overall capability status
      expect(
        logCalls.some(
          call =>
            typeof call === 'string' &&
            (call.includes('[Status] Available capabilities:') ||
              call.includes('[Status] No enhanced capabilities available'))
        )
      ).toBe(true);

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

      const exitCode = await runCommand(['hello'], { provider: 'codex' });

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

      const exitCode = await runCommand(['hello'], { provider: 'codex' });

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
});
