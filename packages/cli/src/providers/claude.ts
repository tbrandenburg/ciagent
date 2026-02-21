import { type ChatChunk, type IAssistantChat, type Message } from './types.js';
import type { CIAConfig } from '../shared/config/loader.js';

interface ProviderConfig {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  [key: string]: unknown;
}

interface ClaudeQueryMessage {
  type?: string;
  message?: {
    content?: Array<{
      type?: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  session_id?: string;
}

function buildSubprocessEnv(
  network?: CIAConfig['network'],
  explicitApiKey?: string
): Record<string, string | undefined> {
  if (explicitApiKey) {
    return applyNetworkEnv(
      {
        ...process.env,
        CLAUDE_API_KEY: explicitApiKey,
        ANTHROPIC_API_KEY: explicitApiKey,
      },
      network
    );
  }

  const globalAuthSetting = process.env.CLAUDE_USE_GLOBAL_AUTH?.toLowerCase();

  const hasExplicitTokens = Boolean(
    process.env.CLAUDE_CODE_OAUTH_TOKEN ??
    process.env.CLAUDE_API_KEY ??
    process.env.ANTHROPIC_API_KEY
  );

  let useGlobalAuth: boolean;
  if (globalAuthSetting === 'true') {
    useGlobalAuth = true;
  } else if (globalAuthSetting === 'false') {
    useGlobalAuth = false;
  } else {
    useGlobalAuth = !hasExplicitTokens;
  }

  if (useGlobalAuth) {
    const { CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_API_KEY, ANTHROPIC_API_KEY, ...envWithoutAuth } =
      process.env;
    return applyNetworkEnv(envWithoutAuth, network);
  }

  return applyNetworkEnv({ ...process.env }, network);
}

function applyNetworkEnv(
  baseEnv: Record<string, string | undefined>,
  network?: CIAConfig['network']
): Record<string, string | undefined> {
  if (!network) {
    return baseEnv;
  }

  if (network['http-proxy']) {
    baseEnv.HTTP_PROXY = network['http-proxy'];
  }
  if (network['https-proxy']) {
    baseEnv.HTTPS_PROXY = network['https-proxy'];
  }
  if (network['no-proxy']) {
    baseEnv.NO_PROXY = network['no-proxy'].join(',');
  }
  if (network['ca-bundle-path']) {
    baseEnv.NODE_EXTRA_CA_CERTS = network['ca-bundle-path'];
  }
  if (network['use-env-proxy'] !== undefined) {
    baseEnv.NODE_USE_ENV_PROXY = network['use-env-proxy'] ? '1' : '0';
  }

  return baseEnv;
}

export class ClaudeAssistantChat implements IAssistantChat {
  private readonly query: (input: {
    prompt: string;
    options: Record<string, unknown>;
  }) => AsyncIterable<ClaudeQueryMessage>;
  private readonly network?: CIAConfig['network'];
  private readonly apiKey?: string;

  private constructor(
    query: ClaudeAssistantChat['query'],
    network?: CIAConfig['network'],
    apiKey?: string
  ) {
    this.query = query;
    this.network = network;
    this.apiKey = apiKey;
  }

  static async create(
    config?: ProviderConfig,
    network?: CIAConfig['network']
  ): Promise<ClaudeAssistantChat> {
    // TODO: Use config.baseUrl, config.apiKey, config.timeout, config.model in future iterations
    void config; // Acknowledge config parameter for interface compatibility
    void network;

    let claudeSdk: {
      query: (input: {
        prompt: string;
        options: Record<string, unknown>;
      }) => AsyncIterable<ClaudeQueryMessage>;
    };

    try {
      claudeSdk = (await import('@anthropic-ai/claude-agent-sdk')) as typeof claudeSdk;
    } catch {
      throw new Error(
        'Claude SDK is not installed. Install dependencies with `bun install` to enable provider=claude.'
      );
    }

    const explicitApiKey =
      typeof config?.apiKey === 'string' && config.apiKey.trim().length > 0
        ? config.apiKey.trim()
        : undefined;

    return new ClaudeAssistantChat(claudeSdk.query, network, explicitApiKey);
  }

  private resolvePrompt(input: string | Message[]): string {
    if (typeof input === 'string') {
      return input;
    }
    return input.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  }

  async *sendQuery(
    input: string | Message[],
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    const prompt = this.resolvePrompt(input);
    const options: Record<string, unknown> = {
      cwd,
      env: buildSubprocessEnv(this.network, this.apiKey),
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project'],
    };

    if (resumeSessionId) {
      options.resume = resumeSessionId;
    }

    for await (const msg of this.query({ prompt, options })) {
      if (msg.type === 'assistant') {
        const contentBlocks = msg.message?.content ?? [];
        for (const block of contentBlocks) {
          if (block.type === 'text' && block.text) {
            yield { type: 'assistant', content: block.text };
          }
          if (block.type === 'tool_use' && block.name) {
            yield { type: 'tool', toolName: block.name };
          }
        }
      }

      if (msg.type === 'result') {
        yield { type: 'result', sessionId: msg.session_id };
      }
    }
  }

  getType(): string {
    return 'claude';
  }

  async listModels(): Promise<string[]> {
    try {
      // Use Anthropic SDK for model listing
      const Anthropic = (await import('@anthropic-ai/sdk')).default;

      // Get API key from environment (matching existing auth pattern)
      const apiKey = this.apiKey ?? process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Return empty array if no API key - provider discovery will handle gracefully
        return [];
      }

      const client = new Anthropic({ apiKey });
      const models = await client.models.list();

      // Extract model IDs from the response
      return models.data.map(model => model.id);
    } catch {
      // If any error occurs, return fallback models
      return ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];
    }
  }
}
