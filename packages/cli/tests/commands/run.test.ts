import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
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

  afterEach(() => {
    mock.restore();
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  it('returns success when assistant content is produced', async () => {
    mock.module('../../src/providers/index.js', () => ({
      createAssistantChat: async () => ({
        sendQuery: () => makeGenerator([{ type: 'assistant', content: 'ok' }]),
        getType: () => 'codex',
      }),
    }));

    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const { runCommand } = await import('../../src/commands/run.js');
    const exitCode = await runCommand(['hello'], { provider: 'codex' });

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('ok');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('returns execution failure on provider error chunk', async () => {
    mock.module('../../src/providers/index.js', () => ({
      createAssistantChat: async () => ({
        sendQuery: () => makeGenerator([{ type: 'error', content: 'turn failed' }]),
        getType: () => 'codex',
      }),
    }));

    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    const { runCommand } = await import('../../src/commands/run.js');
    const exitCode = await runCommand(['hello'], { provider: 'codex' });

    expect(exitCode).toBe(4);
    expect(logSpy).not.toHaveBeenCalledWith('turn failed');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AI execution failed'));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('writes structured output file when output-file is configured', async () => {
    mock.module('../../src/providers/index.js', () => ({
      createAssistantChat: async () => ({
        sendQuery: () => makeGenerator([{ type: 'assistant', content: '{"ok":true}' }]),
        getType: () => 'codex',
      }),
    }));

    const outputFile = `${testOutputDir}/result.json`;
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

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
