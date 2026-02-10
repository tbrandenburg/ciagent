import { CodexAssistantChat } from './codex.js';
import { ClaudeAssistantChat } from './claude.js';
import { type IAssistantChat } from './types.js';

export async function createAssistantChat(provider: string): Promise<IAssistantChat> {
  if (provider === 'codex') {
    return CodexAssistantChat.create();
  }

  if (provider === 'claude') {
    return ClaudeAssistantChat.create();
  }

  throw new Error(`Unsupported provider: ${provider}. Supported: codex, claude.`);
}

export * from './types.js';
