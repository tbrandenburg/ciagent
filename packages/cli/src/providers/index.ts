import { CodexAssistantChat } from './codex.js';
import { ClaudeAssistantChat } from './claude.js';
import { ReliableAssistantChat } from './reliability.js';
import { SchemaValidatingChat } from './schema-validating-chat.js';
import { type IAssistantChat } from './types.js';
import { type CIAConfig, loadStructuredConfig } from '../shared/config/loader.js';
import { readFileSync } from 'fs';
import { JSONSchema7 } from 'json-schema';

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
    assistantChat = new ReliableAssistantChat(assistantChat, config);
  }

  // Conditionally wrap with schema validation if strict mode and schema provided
  if (config && config.mode === 'strict' && (config['schema-file'] || config['schema-inline'])) {
    const schema = loadSchemaFromConfig(config);
    assistantChat = new SchemaValidatingChat(assistantChat, {
      schema,
      maxRetries: config.retries || 3,
      useBackoff: true,
      retryTimeout: config['retry-timeout'] ? config['retry-timeout'] * 1000 : 30000,
    });
  }

  return assistantChat;
}

/**
 * Load JSON schema from config (either file or inline)
 */
function loadSchemaFromConfig(config: CIAConfig): JSONSchema7 {
  if (config['schema-inline']) {
    try {
      return JSON.parse(config['schema-inline']) as JSONSchema7;
    } catch (error) {
      throw new Error(
        `Invalid JSON in --schema-inline: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (config['schema-file']) {
    try {
      const schemaContent = readFileSync(config['schema-file'], 'utf-8');
      return JSON.parse(schemaContent) as JSONSchema7;
    } catch (error) {
      throw new Error(
        `Failed to load schema file ${config['schema-file']}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(
    'No schema provided - this should not happen as validation should catch this earlier'
  );
}

export * from './types.js';
