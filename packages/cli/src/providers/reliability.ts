import pRetry, { AbortError } from 'p-retry';
import { IAssistantChat, ChatChunk } from './types.js';
import { CommonErrors } from '../shared/errors/error-handling.js';
import { validateChunkTypes, validateSessionId } from './contract-validator.js';
import { CIAConfig } from '../shared/config/loader.js';

export class ReliableAssistantChat implements IAssistantChat {
  private provider: IAssistantChat;
  private config: CIAConfig;

  constructor(provider: IAssistantChat, config: CIAConfig) {
    this.provider = provider;
    this.config = config;
  }

  async *sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    const maxRetries = this.config.retries ?? 3;
    const useBackoff = this.config['retry-backoff'] ?? true;
    const retryTimeout = this.config['retry-timeout'] ?? 30000;
    const contractValidation = this.config['contract-validation'] ?? false;

    let isNonRetryableError = false;
    let finalErrorMessage = '';

    try {
      const successfulChunks = await pRetry(
        async () => {
          const chunks: ChatChunk[] = [];
          let hasError = false;
          let errorMessage = '';

          try {
            // Collect all chunks from the provider
            for await (const chunk of this.provider.sendQuery(prompt, cwd, resumeSessionId)) {
              // Contract validation if enabled
              if (contractValidation) {
                if (!validateChunkTypes(chunk)) {
                  const errorMsg = `Contract validation failed: Invalid chunk type: ${chunk.type}`;
                  isNonRetryableError = true;
                  finalErrorMessage = errorMsg;
                  throw new AbortError(errorMsg);
                }

                if (!validateSessionId(chunk)) {
                  const errorMsg =
                    'Contract validation failed: Missing or invalid sessionId in result chunk';
                  isNonRetryableError = true;
                  finalErrorMessage = errorMsg;
                  throw new AbortError(errorMsg);
                }
              }

              chunks.push(chunk);

              // Check for error chunks
              if (chunk.type === 'error' && chunk.content) {
                hasError = true;
                errorMessage = chunk.content;
              }
            }
          } catch (providerError) {
            // Handle exceptions thrown by the provider
            const errorMsg =
              providerError instanceof Error ? providerError.message : String(providerError);

            // Check if this is a non-retryable error
            if (this.isNonRetryableError(errorMsg)) {
              isNonRetryableError = true;
              finalErrorMessage = errorMsg;
              throw new AbortError(errorMsg);
            }

            // Otherwise, let pRetry handle the retry
            throw providerError;
          }

          // If we collected error chunks, decide if we should retry
          if (hasError) {
            // Check for non-retryable errors
            if (this.isNonRetryableError(errorMessage)) {
              isNonRetryableError = true;
              finalErrorMessage = errorMessage;
              throw new AbortError(errorMessage);
            }
            throw new Error(errorMessage);
          }

          return chunks;
        },
        {
          retries: maxRetries,
          factor: useBackoff ? 2 : 1,
          minTimeout: useBackoff ? 1000 : 500,
          maxTimeout: retryTimeout,
          randomize: useBackoff,
          onFailedAttempt: () => {
            // Optional: log retry attempts (can be enabled for debugging)
          },
        }
      );

      // Stream the successful chunks
      for (const chunk of successfulChunks) {
        yield chunk;
      }
    } catch (error) {
      // Check if we marked this as non-retryable
      if (isNonRetryableError) {
        // Non-retryable errors
        const providerError = CommonErrors.providerUnreliable(this.getType(), finalErrorMessage);
        yield { type: 'error', content: providerError.message };
      } else {
        // Retry exhausted
        const retryError = CommonErrors.retryExhausted(
          maxRetries,
          error instanceof Error ? error.message : String(error)
        );
        yield { type: 'error', content: retryError.message };
      }
    }
  }

  private isNonRetryableError(message: string): boolean {
    const nonRetryablePatterns = [
      'authentication',
      'unauthorized',
      '401',
      'not found',
      '404',
      'contract validation failed',
    ];

    const lowerMessage = message.toLowerCase();
    return nonRetryablePatterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()));
  }

  getType(): string {
    return `reliable-${this.provider.getType()}`;
  }
}
