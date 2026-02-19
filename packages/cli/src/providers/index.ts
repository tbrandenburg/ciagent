import { CodexAssistantChat } from './codex.js';
import { ClaudeAssistantChat } from './claude.js';
import { VercelAssistantChat } from './vercel.js';
import { ReliableAssistantChat } from './reliability.js';
import { SchemaValidatingChat } from './schema-validating-chat.js';
import { mcpProvider } from './mcp.js';
import { type IAssistantChat } from './types.js';
import { type CIAConfig, loadStructuredConfig } from '../shared/config/loader.js';
import { readFileSync } from 'fs';
import { JSONSchema7 } from 'json-schema';

// Extensible list of supported Vercel providers
const VERCEL_PROVIDERS = ['azure', 'openai']; // Will expand as new Vercel providers are added

export async function createAssistantChat(
  provider: string,
  config?: CIAConfig
): Promise<IAssistantChat> {
  let assistantChat: IAssistantChat;

  // Initialize MCP provider if MCP configuration is present
  if (config) {
    const structuredConfig = loadStructuredConfig(config);
    if (structuredConfig?.mcp && Object.keys(structuredConfig.mcp).length > 0) {
      try {
        console.log('[Provider Factory] Initializing MCP provider...');
        await mcpProvider.initialize(config);
        const healthInfo = mcpProvider.getHealthInfo();
        console.log(
          `[Provider Factory] MCP provider initialized: ${healthInfo.connectedServers}/${healthInfo.serverCount} servers connected, ${healthInfo.toolCount} tools available`
        );
      } catch (error) {
        console.error('[Provider Factory] MCP provider initialization failed:', error);
        // Continue without MCP - non-blocking
      }
    }
  }

  // Load structured configuration with environment variable substitution
  const structuredConfig = config ? loadStructuredConfig(config) : undefined;
  const providerConfig = structuredConfig?.providers?.[provider];

  // Check if it's a Vercel provider first (extensible pattern)
  if (VERCEL_PROVIDERS.includes(provider)) {
    assistantChat = await VercelAssistantChat.create(provider, providerConfig);
  } else if (provider === 'codex') {
    assistantChat = await CodexAssistantChat.create(providerConfig);
  } else if (provider === 'claude') {
    assistantChat = await ClaudeAssistantChat.create(providerConfig);
  } else {
    const allSupportedProviders = [...VERCEL_PROVIDERS, 'codex', 'claude'];
    throw new Error(
      `Unsupported provider: ${provider}. Supported: ${allSupportedProviders.join(', ')}.`
    );
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

/**
 * Get all supported provider names for CLI help and validation
 */
export function getSupportedProviders(): string[] {
  return [...VERCEL_PROVIDERS, 'codex', 'claude'];
}

/**
 * Get MCP provider health status for diagnostics
 */
export function getMCPStatus() {
  return mcpProvider.getHealthInfo();
}

/**
 * Refresh MCP connections
 */
export async function refreshMCP(): Promise<void> {
  await mcpProvider.refresh();
}

/**
 * Execute an MCP tool by ID
 */
export async function executeMCPTool(toolId: string, args: unknown): Promise<any> {
  return mcpProvider.executeTool(toolId, args);
}

export * from './types.js';
