import type { LanguageModel } from 'ai';
import { streamText } from 'ai';
import type { ChatChunk, IAssistantChat, Message } from './types.js';
import { VercelProviderFactory, type VercelProviderConfig } from './vercel-factory.js';

/**
 * Generic Vercel AI SDK adapter implementing IAssistantChat interface
 * Works with any Vercel provider instance (azure, openai, google, anthropic, etc.)
 */
export class VercelAssistantChat implements IAssistantChat {
  private readonly provider: LanguageModel;
  private readonly providerName: string;

  private constructor(provider: LanguageModel, providerName: string) {
    this.provider = provider;
    this.providerName = providerName;
  }

  /**
   * Create a VercelAssistantChat instance for the specified provider type
   * @param providerType - Provider type ('azure', 'openai', 'google', 'anthropic')
   * @param config - Provider-specific configuration
   * @returns Promise<VercelAssistantChat> instance
   */
  static async create(
    providerType: string,
    config?: VercelProviderConfig
  ): Promise<VercelAssistantChat> {
    const provider = await VercelProviderFactory.createProvider(providerType, config);
    return new VercelAssistantChat(provider, providerType);
  }

  /**
   * Resolve input to a string prompt (compatible with existing interface)
   * @param input - String prompt or Message array
   * @returns Resolved prompt string
   */
  private resolvePrompt(input: string | Message[]): string {
    if (typeof input === 'string') {
      return input;
    }
    return input.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  }

  /**
   * Generate session ID (simple implementation for now)
   * @returns Generated session ID string
   */
  private generateSessionId(): string {
    return `vercel-${this.providerName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send query to the Vercel provider using unified streaming interface
   * @param input - String prompt or Message array
   * @param cwd - Current working directory (unused by Vercel SDK but kept for interface compatibility)
   * @param resumeSessionId - Session ID to resume (simple implementation - not fully supported yet)
   * @yields ChatChunk responses from the provider
   */
  async *sendQuery(
    input: string | Message[],
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    const prompt = this.resolvePrompt(input);

    // Note: cwd parameter kept for interface compatibility but not used by Vercel SDK
    void cwd;

    // Note: resumeSessionId support is simplified for now
    // Future enhancement could implement proper session management
    if (resumeSessionId) {
      yield {
        type: 'system',
        content: `Resuming session ${resumeSessionId} - Note: Full session management not yet implemented for Vercel providers`,
      };
    }

    try {
      // Use Vercel AI SDK unified streaming interface
      const { textStream } = await streamText({
        model: this.provider,
        prompt: prompt,
      });

      // Convert Vercel textStream to ChatChunk format
      for await (const textPart of textStream) {
        yield {
          type: 'assistant',
          content: textPart,
        };
      }

      // Send completion result
      const sessionId = resumeSessionId || this.generateSessionId();
      yield {
        type: 'result',
        sessionId: sessionId,
      };
    } catch (error) {
      // Handle errors gracefully
      const errorMessage = error instanceof Error ? error.message : 'Unknown Vercel provider error';
      yield {
        type: 'error',
        content: `Vercel ${this.providerName} provider error: ${errorMessage}`,
      };
    }
  }

  /**
   * Get provider type identifier
   * @returns Provider type string (e.g., 'vercel-azure', 'vercel-openai')
   */
  getType(): string {
    return `vercel-${this.providerName}`;
  }
}
