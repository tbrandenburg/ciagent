import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { type ChatChunk, type IAssistantChat, type Message } from './types.js';

interface ProviderConfig {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  [key: string]: unknown;
}

interface CodexAuth {
  tokens?: {
    id_token?: string;
    access_token?: string;
  };
}

export class CodexAssistantChat implements IAssistantChat {
  private readonly codex: {
    startThread: (options: Record<string, unknown>) => {
      id?: string;
      runStreamed: (prompt: string) => Promise<{
        events: AsyncIterable<Record<string, unknown>>;
      }>;
    };
    resumeThread: (
      sessionId: string,
      options: Record<string, unknown>
    ) => {
      id?: string;
      runStreamed: (prompt: string) => Promise<{
        events: AsyncIterable<Record<string, unknown>>;
      }>;
    };
  };

  private readonly model?: string;

  private constructor(codex: CodexAssistantChat['codex'], model?: string) {
    this.codex = codex;
    this.model = model;
  }

  static async create(config?: ProviderConfig): Promise<CodexAssistantChat> {
    const configuredModel =
      typeof config?.model === 'string' && config.model.trim().length > 0
        ? config.model.trim()
        : undefined;

    const homeDir = process.env.HOME;
    if (!homeDir) {
      throw new Error('HOME is not set. Cannot resolve ~/.codex/auth.json');
    }

    const authPath = resolve(homeDir, '.codex', 'auth.json');
    if (!existsSync(authPath)) {
      throw new Error(`Codex auth file not found: ${authPath}`);
    }

    const authRaw = readFileSync(authPath, 'utf8');
    const auth = JSON.parse(authRaw) as CodexAuth;
    const idToken = auth.tokens?.id_token;
    const accessToken = auth.tokens?.access_token;

    if (!idToken || !accessToken) {
      throw new Error(`Invalid Codex auth file: ${authPath}`);
    }

    process.env.CODEX_ID_TOKEN = idToken;
    process.env.CODEX_ACCESS_TOKEN = accessToken;

    let codexModule: { Codex: new () => CodexAssistantChat['codex'] };

    try {
      codexModule = (await import('@openai/codex-sdk')) as {
        Codex: new () => CodexAssistantChat['codex'];
      };
    } catch {
      throw new Error(
        'Codex SDK is not installed. Install dependencies with `bun install` to enable provider=codex.'
      );
    }

    return new CodexAssistantChat(new codexModule.Codex(), configuredModel);
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
    const threadOptions = {
      workingDirectory: cwd,
      skipGitRepoCheck: true,
      sandboxMode: 'danger-full-access',
      networkAccessEnabled: true,
      approvalPolicy: 'never',
      ...(this.model ? { model: this.model } : {}),
    };

    let thread;
    if (resumeSessionId) {
      try {
        thread = this.codex.resumeThread(resumeSessionId, threadOptions);
      } catch {
        thread = this.codex.startThread(threadOptions);
        yield { type: 'system', content: 'Could not resume session. Started a new one.' };
      }
    } else {
      thread = this.codex.startThread(threadOptions);
    }

    const result = await thread.runStreamed(prompt);

    for await (const event of result.events) {
      const eventType = event.type;

      if (eventType === 'error') {
        const eventError = event.error as { message?: string } | undefined;
        const message =
          (typeof event.message === 'string' && event.message) ||
          (typeof eventError?.message === 'string' && eventError.message) ||
          'Unknown Codex error';
        yield { type: 'error', content: message };
        break;
      }

      if (eventType === 'turn.failed') {
        const error = event.error as { message?: string; cause?: { message?: string } } | undefined;
        const message = error?.message ?? error?.cause?.message ?? 'Codex turn failed';
        yield { type: 'error', content: message };
        break;
      }

      if (eventType === 'item.completed') {
        const item = event.item as { type?: string; text?: string; command?: string } | undefined;

        if (item?.type === 'agent_message' && item.text) {
          yield { type: 'assistant', content: item.text };
        }

        if (item?.type === 'command_execution' && item.command) {
          yield { type: 'tool', toolName: item.command };
        }

        if (item?.type === 'reasoning' && item.text) {
          yield { type: 'thinking', content: item.text };
        }
      }

      if (eventType === 'turn.completed') {
        yield { type: 'result', sessionId: thread.id };
        break;
      }
    }
  }

  getType(): string {
    return 'codex';
  }

  async listModels(): Promise<string[]> {
    // Codex SDK may not have model listing API - use fallback to known models
    try {
      // Try to call Codex SDK model listing if available (future SDK versions)
      if (this.codex && typeof (this.codex as any).listModels === 'function') {
        return await (this.codex as any).listModels();
      }
      // Fallback to known Codex models
      return ['gpt-5.3-codex'];
    } catch {
      // If any error occurs, return fallback models
      return ['gpt-5.3-codex'];
    }
  }
}
