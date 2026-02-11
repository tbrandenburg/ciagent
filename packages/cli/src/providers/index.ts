import { CodexAssistantChat } from './codex.js';
import { ClaudeAssistantChat } from './claude.js';
import { ReliableAssistantChat } from './reliability.js';
import { type IAssistantChat } from './types.js';
import { type CIAConfig, loadStructuredConfig } from '../shared/config/loader.js';

export async function createAssistantChat(
  provider: string,
  config?: CIAConfig
): Promise<IAssistantChat> {
  let assistantChat: IAssistantChat;

  // Load structured configuration with environment variable substitution
  const structuredConfig = config ? loadStructuredConfig(config) : undefined;
  const providerConfig = structuredConfig?.providers?.[provider];

  if (provider === 'codex') {
    assistantChat = await CodexAssistantChat.create(providerConfig);
  } else if (provider === 'claude') {
    assistantChat = await ClaudeAssistantChat.create(providerConfig);
  } else {
    throw new Error(`Unsupported provider: ${provider}. Supported: codex, claude.`);
  }

  // Conditionally wrap with reliability features if configuration provided
  if (config && (config.retries || config['contract-validation'] || config['retry-timeout'])) {
    return new ReliableAssistantChat(assistantChat, config);
  }

  return assistantChat;
}

export * from './types.js';
