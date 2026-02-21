import pRetry, { AbortError } from 'p-retry';
import { IAssistantChat, ChatChunk, Message } from './types.js';
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
    input: string | Message[],
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    const maxRetries = this.config.retries ?? 3;
    const useBackoff = this.config['retry-backoff'] ?? true;
    const retryTimeout = this.config['retry-timeout'] ?? 30000;
    const contractValidation = this.config['contract-validation'] ?? false;
    const perAttemptMinDelay = useBackoff ? 1000 : 500;
    const retryWindowMs = Math.max(retryTimeout, (maxRetries + 1) * perAttemptMinDelay);
    const retryWindowController = new AbortController();
    const retryWindowTimeout = setTimeout(() => {
      retryWindowController.abort(new Error(`Retry window timed out after ${retryWindowMs}ms`));
    }, retryWindowMs);

    let isNonRetryableError = false;
    let finalErrorMessage = '';

    try {
      const successfulChunks = await pRetry(
        async () => {
          if (retryWindowController.signal.aborted) {
            const reason = retryWindowController.signal.reason;
            const reasonMessage = reason instanceof Error ? reason.message : String(reason);
            isNonRetryableError = true;
            finalErrorMessage = reasonMessage;
            throw new AbortError(reasonMessage);
          }

          const chunks: ChatChunk[] = [];
          let hasError = false;
          let errorMessage = '';

          try {
            // Collect all chunks from the provider
            // Call provider with appropriate overload
            const queryIterable =
              typeof input === 'string'
                ? this.provider.sendQuery(input, cwd, resumeSessionId)
                : this.provider.sendQuery(input, cwd, resumeSessionId);

            for await (const chunk of queryIterable) {
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
          maxRetryTime: retryWindowMs,
          signal: retryWindowController.signal,
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
      const formatChunkError = (message: string, details?: string): string =>
        details && details.trim().length > 0 ? `${message}: ${details}` : message;

      // Check if we marked this as non-retryable
      if (isNonRetryableError) {
        // Non-retryable errors
        const providerError = CommonErrors.providerUnreliable(this.getType(), finalErrorMessage);
        yield {
          type: 'error',
          content: formatChunkError(providerError.message, providerError.details),
        };
      } else {
        // Retry exhausted
        const retryError = CommonErrors.retryExhausted(
          maxRetries,
          error instanceof Error ? error.message : String(error)
        );
        yield {
          type: 'error',
          content: formatChunkError(retryError.message, retryError.details),
        };
      }
    } finally {
      clearTimeout(retryWindowTimeout);
    }
  }

  private isNonRetryableError(message: string): boolean {
    const nonRetryablePatterns = [
      'authentication',
      'unauthorized',
      'authorization',
      'forbidden',
      'permission',
      'access denied',
      'invalid api key',
      'model',
      'does not exist',
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

  async listModels(): Promise<string[]> {
    return await this.provider.listModels();
  }
}
