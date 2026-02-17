import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IAssistantChat } from '../../src/providers/types.js';
import * as providers from '../../src/providers/index.js';
import { modelsCommand } from '../../src/commands/models.js';
import { ExitCode } from '../../src/utils/exit-codes.js';

// Mock assistant chat with listModels method
const createMockAssistantChat = (models: string[], type: string): IAssistantChat => ({
  sendQuery: vi.fn() as any, // Cast to any to handle overloaded interface
  getType: () => type,
  listModels: vi.fn().mockResolvedValue(models),
});

describe('modelsCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('returns success when models are listed from single provider', async () => {
    const mockAssistantChat = createMockAssistantChat(['model-1', 'model-2'], 'codex');

    const createAssistantChatSpy = vi
      .spyOn(providers, 'createAssistantChat')
      .mockResolvedValue(mockAssistantChat);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await modelsCommand({ provider: 'codex' });

    expect(exitCode).toBe(ExitCode.SUCCESS);
    expect(logSpy).toHaveBeenCalledWith('codex/model-1');
    expect(logSpy).toHaveBeenCalledWith('codex/model-2');
    expect(createAssistantChatSpy).toHaveBeenCalledWith('codex', { provider: 'codex' });
  });

  it('returns success with JSON format', async () => {
    const mockAssistantChat = createMockAssistantChat(['model-1', 'model-2'], 'codex');

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await modelsCommand({ provider: 'codex', format: 'json' });

    expect(exitCode).toBe(ExitCode.SUCCESS);
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ models: ['codex/model-1', 'codex/model-2'] }, null, 2)
    );
  });

  it('returns models from all providers when no provider filter specified', async () => {
    const codexMock = createMockAssistantChat(['codex-v1'], 'codex');
    const claudeMock = createMockAssistantChat(['claude-3-5-sonnet'], 'claude');
    const azureMock = createMockAssistantChat(['gpt-4o'], 'azure');

    const createAssistantChatSpy = vi
      .spyOn(providers, 'createAssistantChat')
      .mockImplementation(async (provider: string) => {
        switch (provider) {
          case 'codex':
            return codexMock;
          case 'claude':
            return claudeMock;
          case 'azure':
            return azureMock;
          default:
            throw new Error(`Unknown provider: ${provider}`);
        }
      });

    const getSupportedProvidersSpy = vi
      .spyOn(providers, 'getSupportedProviders')
      .mockReturnValue(['codex', 'claude', 'azure']);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await modelsCommand({});

    expect(exitCode).toBe(ExitCode.SUCCESS);
    expect(getSupportedProvidersSpy).toHaveBeenCalled();
    expect(createAssistantChatSpy).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith('azure/gpt-4o');
    expect(logSpy).toHaveBeenCalledWith('claude/claude-3-5-sonnet');
    expect(logSpy).toHaveBeenCalledWith('codex/codex-v1');
  });

  it('handles provider failure gracefully', async () => {
    const workingMock = createMockAssistantChat(['working-model'], 'codex');

    const createAssistantChatSpy = vi
      .spyOn(providers, 'createAssistantChat')
      .mockImplementation(async (provider: string) => {
        if (provider === 'codex') return workingMock;
        throw new Error('Provider not configured');
      });

    const getSupportedProvidersSpy = vi
      .spyOn(providers, 'getSupportedProviders')
      .mockReturnValue(['codex', 'claude']);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await modelsCommand({});

    expect(exitCode).toBe(ExitCode.SUCCESS);
    expect(logSpy).toHaveBeenCalledWith('codex/working-model');
    // Should not log anything for the failed provider
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('claude/'));
  });

  it('returns error for invalid provider filter', async () => {
    const getSupportedProvidersSpy = vi
      .spyOn(providers, 'getSupportedProviders')
      .mockReturnValue(['codex', 'claude', 'azure']);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await modelsCommand({ provider: 'invalid-provider' });

    expect(exitCode).toBe(ExitCode.INPUT_VALIDATION);
    expect(getSupportedProvidersSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns error when no models found from any provider', async () => {
    const emptyMock = createMockAssistantChat([], 'codex');

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(emptyMock);
    vi.spyOn(providers, 'getSupportedProviders').mockReturnValue(['codex']);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await modelsCommand({});

    expect(exitCode).toBe(ExitCode.LLM_EXECUTION);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('removes duplicate models and sorts them', async () => {
    const mockAssistantChat = createMockAssistantChat(['model-b', 'model-a', 'model-b'], 'codex');

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await modelsCommand({ provider: 'codex' });

    expect(exitCode).toBe(ExitCode.SUCCESS);
    // Should be sorted and deduplicated
    expect(logSpy).toHaveBeenNthCalledWith(1, 'codex/model-a');
    expect(logSpy).toHaveBeenNthCalledWith(2, 'codex/model-b');
    expect(logSpy).toHaveBeenCalledTimes(2); // No duplicates
  });

  it('handles provider listModels throwing error', async () => {
    const failingMock: IAssistantChat = {
      sendQuery: vi.fn() as any, // Cast to any to handle overloaded interface
      getType: () => 'codex',
      listModels: vi.fn().mockRejectedValue(new Error('API Error')),
    };

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(failingMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await modelsCommand({ provider: 'codex' });

    expect(exitCode).toBe(ExitCode.LLM_EXECUTION);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('uses slash notation format (not colon)', async () => {
    const mockAssistantChat = createMockAssistantChat(['gpt-4o'], 'azure');

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockAssistantChat);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const exitCode = await modelsCommand({ provider: 'azure' });

    expect(exitCode).toBe(ExitCode.SUCCESS);
    // CRITICAL: Must use slash notation, not colon
    expect(logSpy).toHaveBeenCalledWith('azure/gpt-4o');
    expect(logSpy).not.toHaveBeenCalledWith('azure:gpt-4o');
  });
});
