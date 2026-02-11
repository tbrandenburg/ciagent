import { type ChatChunk, type IAssistantChat, type Message } from './types.js';

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

function buildSubprocessEnv(): Record<string, string | undefined> {
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
    return envWithoutAuth;
  }

  return { ...process.env };
}

export class ClaudeAssistantChat implements IAssistantChat {
  private readonly query: (input: {
    prompt: string;
    options: Record<string, unknown>;
  }) => AsyncIterable<ClaudeQueryMessage>;

  private constructor(query: ClaudeAssistantChat['query']) {
    this.query = query;
  }

  static async create(): Promise<ClaudeAssistantChat> {
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

    return new ClaudeAssistantChat(claudeSdk.query);
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
      env: buildSubprocessEnv(),
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
}
