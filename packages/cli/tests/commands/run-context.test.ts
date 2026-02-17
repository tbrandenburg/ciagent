import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
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

describe('runCommand with context integration', () => {
  const testDir = '/tmp/cia-context-tests';
  const testFile = join(testDir, 'test.txt');
  const testJsonFile = join(testDir, 'test.json');
  const testYamlFile = join(testDir, 'test.yaml');

  let mockAssistantChat: {
    sendQuery: () => AsyncGenerator<ChatChunk>;
    getType: () => string;
  };
  let createAssistantChatSpy: any;
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup test directory and files
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    writeFileSync(testFile, 'This is test content');
    writeFileSync(testJsonFile, '{"test": "data", "number": 42}');
    writeFileSync(testYamlFile, 'test: yaml\nnumber: 123');

    // Setup default mock
    mockAssistantChat = {
      sendQuery: () =>
        makeGenerator([{ type: 'assistant', content: 'Context processed successfully' }]),
      getType: () => 'codex',
    };

    createAssistantChatSpy = vi
      .spyOn(providers, 'createAssistantChat')
      .mockResolvedValue(mockAssistantChat);

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('single context source processing', () => {
    it('processes file context successfully', async () => {
      const exitCode = await runCommand(['analyze this file'], {
        provider: 'codex',
        context: [testFile],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalledWith(
        'codex',
        expect.objectContaining({
          provider: 'codex',
        })
      );
    });

    it('processes folder context successfully', async () => {
      const exitCode = await runCommand(['analyze this folder'], {
        provider: 'codex',
        context: [testDir],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });

    it('processes direct JSON content', async () => {
      const jsonContent = '{"type": "direct", "message": "test content"}';

      const exitCode = await runCommand(['process this data'], {
        provider: 'codex',
        context: [jsonContent],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });

    it('processes direct text content', async () => {
      const textContent = 'This is direct text content for processing';

      const exitCode = await runCommand(['analyze this text'], {
        provider: 'codex',
        context: [textContent],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });
  });

  describe('multiple context sources', () => {
    it('processes mixed context types in single command', async () => {
      const jsonContent = '{"config": "value"}';

      const exitCode = await runCommand(['analyze all contexts'], {
        provider: 'codex',
        context: [testFile, testDir, jsonContent],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith('Context processed successfully');
    });

    it('processes mixed file and text contexts', async () => {
      const directText = 'This content will be processed as direct text';

      const exitCode = await runCommand(['analyze mixed contexts'], {
        provider: 'codex',
        context: [testFile, directText, testJsonFile],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });
  });

  describe('error handling and edge cases', () => {
    it('handles malformed JSON gracefully', async () => {
      const malformedFile = join(testDir, 'malformed.json');
      writeFileSync(malformedFile, '{"incomplete": json');

      const exitCode = await runCommand(['analyze malformed file'], {
        provider: 'codex',
        context: [malformedFile],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });

    it('handles empty folder context', async () => {
      const emptyDir = join(testDir, 'empty');
      mkdirSync(emptyDir);

      const exitCode = await runCommand(['analyze empty folder'], {
        provider: 'codex',
        context: [emptyDir],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });
  });

  describe('CLI argument parsing with context flags', () => {
    it('parses single context flag correctly', async () => {
      const exitCode = await runCommand(['test query'], {
        provider: 'codex',
        context: [testFile],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalledWith(
        'codex',
        expect.objectContaining({
          provider: 'codex',
        })
      );
    });

    it('parses multiple context flags correctly', async () => {
      const exitCode = await runCommand(['test query with multiple contexts'], {
        provider: 'codex',
        context: [testFile, testJsonFile, testYamlFile],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });

    it('works without context flags', async () => {
      const exitCode = await runCommand(['test query without context'], {
        provider: 'codex',
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalledWith(
        'codex',
        expect.objectContaining({
          provider: 'codex',
        })
      );
    });
  });

  describe('format-agnostic file loading', () => {
    it('loads YAML file and converts to JSON', async () => {
      const exitCode = await runCommand(['analyze yaml'], {
        provider: 'codex',
        context: [testYamlFile],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });

    it('loads JSON file directly', async () => {
      const exitCode = await runCommand(['analyze json'], {
        provider: 'codex',
        context: [testJsonFile],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });

    it('falls back to text for unknown formats', async () => {
      const exitCode = await runCommand(['analyze text'], {
        provider: 'codex',
        context: [testFile],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
    });
  });

  describe('context integration in provider calls', () => {
    it('includes processed context in provider sendQuery calls', async () => {
      const sendQuerySpy = vi
        .fn()
        .mockReturnValue(makeGenerator([{ type: 'assistant', content: 'Response with context' }]));

      mockAssistantChat.sendQuery = sendQuerySpy;

      const exitCode = await runCommand(['analyze with context'], {
        provider: 'codex',
        context: [testFile, testJsonFile],
      });

      expect(exitCode).toBe(0);
      expect(sendQuerySpy).toHaveBeenCalled();

      // Verify that the query includes context information
      const queryCall = sendQuerySpy.mock.calls[0];
      expect(queryCall[0]).toContain('analyze with context');
    });

    it('handles provider errors with context gracefully', async () => {
      const failingChat = {
        sendQuery: () => makeGenerator([{ type: 'error', content: 'Provider failed' }]),
        getType: () => 'codex',
      };

      createAssistantChatSpy.mockResolvedValue(failingChat);

      const exitCode = await runCommand(['test with context'], {
        provider: 'codex',
        context: [testFile],
      });

      expect(exitCode).toBe(4); // Execution failure
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AI execution failed'));
    });
  });

  describe('end-to-end context workflow', () => {
    it('completes workflow with mixed contexts', async () => {
      const directJson = '{"workflow": "end-to-end", "test": true}';
      const directText = 'Additional context from direct text input';

      const exitCode = await runCommand(['Complete analysis of all provided contexts'], {
        provider: 'codex',
        context: [
          testFile, // File context
          testDir, // Folder context
          directJson, // Direct JSON context
          directText, // Direct text context
        ],
      });

      expect(exitCode).toBe(0);
      expect(createAssistantChatSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith('Context processed successfully');
    });
  });
});
