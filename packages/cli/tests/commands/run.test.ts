import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'fs';
import type { ChatChunk } from '../../src/providers/types.js';

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
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  it('returns success when assistant content is produced', async () => {
    const mockCreateAssistantChat = vi.fn(async () => ({
      sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
      getType: () => 'codex',
    }));

    vi.doMock('../../src/providers/index.js', () => ({
      createAssistantChat: mockCreateAssistantChat,
    }));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runCommand } = await import('../../src/commands/run.js');
    const exitCode = await runCommand(['hello'], { provider: 'codex' });

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('ok');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('returns execution failure on provider error chunk', async () => {
    const mockCreateAssistantChat = vi.fn(async () => ({
      sendQuery: () => makeGenerator([{ type: 'error', content: 'turn failed' }]),
      getType: () => 'codex',
    }));

    vi.doMock('../../src/providers/index.js', () => ({
      createAssistantChat: mockCreateAssistantChat,
    }));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCommand } = await import('../../src/commands/run.js');
    const exitCode = await runCommand(['hello'], { provider: 'codex' });

    expect(exitCode).toBe(4);
    expect(logSpy).not.toHaveBeenCalledWith('turn failed');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AI execution failed'));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('writes structured output file when output-file is configured', async () => {
    const mockCreateAssistantChat = vi.fn(async () => ({
      sendQuery: () => makeGenerator([{ type: 'assistant', content: '{"ok":true}' }]),
      getType: () => 'codex',
    }));

    vi.doMock('../../src/providers/index.js', () => ({
      createAssistantChat: mockCreateAssistantChat,
    }));

    const outputFile = `${testOutputDir}/result.json`;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runCommand } = await import('../../src/commands/run.js');
    const exitCode = await runCommand(['hello'], {
      provider: 'codex',
      'output-file': outputFile,
      format: 'json',
    });

    expect(exitCode).toBe(0);
    expect(existsSync(outputFile)).toBe(true);
    const written = JSON.parse(readFileSync(outputFile, 'utf8')) as {
      success: boolean;
      response: { ok: boolean };
      metadata: { runner: string };
    };
    expect(written.success).toBe(true);
    expect(written.response.ok).toBe(true);
    expect(written.metadata.runner).toBe('cia');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
