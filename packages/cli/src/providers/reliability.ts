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
      const attemptResult = await pRetry(
        async () => {
          if (retryWindowController.signal.aborted) {
            const reason = retryWindowController.signal.reason;
            const reasonMessage = reason instanceof Error ? reason.message : String(reason);
            isNonRetryableError = true;
            finalErrorMessage = reasonMessage;
            throw new AbortError(reasonMessage);
          }

          // Call provider with appropriate overload
          const queryIterable =
            typeof input === 'string'
              ? this.provider.sendQuery(input, cwd, resumeSessionId)
              : this.provider.sendQuery(input, cwd, resumeSessionId);
          const iterator = queryIterable[Symbol.asyncIterator]();
          let firstChunkResult: IteratorResult<ChatChunk>;
          try {
            firstChunkResult = await iterator.next();
          } catch (providerError) {
            const errorMsg =
              providerError instanceof Error ? providerError.message : String(providerError);
            if (this.isNonRetryableError(errorMsg)) {
              isNonRetryableError = true;
              finalErrorMessage = errorMsg;
              throw new AbortError(errorMsg);
            }
            throw providerError;
          }

          if (firstChunkResult.done) {
            return {
              firstChunk: undefined as ChatChunk | undefined,
              iterator,
            };
          }

          const firstChunk = firstChunkResult.value;

          if (contractValidation) {
            if (!validateChunkTypes(firstChunk)) {
              const errorMsg = `Contract validation failed: Invalid chunk type: ${firstChunk.type}`;
              isNonRetryableError = true;
              finalErrorMessage = errorMsg;
              throw new AbortError(errorMsg);
            }

            if (!validateSessionId(firstChunk)) {
              const errorMsg =
                'Contract validation failed: Missing or invalid sessionId in result chunk';
              isNonRetryableError = true;
              finalErrorMessage = errorMsg;
              throw new AbortError(errorMsg);
            }
          }

          if (firstChunk.type === 'error' && firstChunk.content) {
            if (this.isNonRetryableError(firstChunk.content)) {
              isNonRetryableError = true;
              finalErrorMessage = firstChunk.content;
              throw new AbortError(firstChunk.content);
            }
            throw new Error(firstChunk.content);
          }

          return {
            firstChunk,
            iterator,
          };
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

      if (!attemptResult.firstChunk) {
        return;
      }

      yield attemptResult.firstChunk;

      while (true) {
        let nextChunkResult: IteratorResult<ChatChunk>;
        try {
          nextChunkResult = await attemptResult.iterator.next();
        } catch (providerError) {
          const errorMsg =
            providerError instanceof Error ? providerError.message : String(providerError);
          const providerErrorChunk = CommonErrors.providerUnreliable(this.getType(), errorMsg);
          yield {
            type: 'error',
            content: providerErrorChunk.details
              ? `${providerErrorChunk.message}: ${providerErrorChunk.details}`
              : providerErrorChunk.message,
          };
          return;
        }

        if (nextChunkResult.done) {
          break;
        }

        const chunk = nextChunkResult.value;
        if (contractValidation) {
          if (!validateChunkTypes(chunk)) {
            const errorMsg = `Contract validation failed: Invalid chunk type: ${chunk.type}`;
            const providerErrorChunk = CommonErrors.providerUnreliable(this.getType(), errorMsg);
            yield {
              type: 'error',
              content: providerErrorChunk.details
                ? `${providerErrorChunk.message}: ${providerErrorChunk.details}`
                : providerErrorChunk.message,
            };
            return;
          }

          if (!validateSessionId(chunk)) {
            const errorMsg =
              'Contract validation failed: Missing or invalid sessionId in result chunk';
            const providerErrorChunk = CommonErrors.providerUnreliable(this.getType(), errorMsg);
            yield {
              type: 'error',
              content: providerErrorChunk.details
                ? `${providerErrorChunk.message}: ${providerErrorChunk.details}`
                : providerErrorChunk.message,
            };
            return;
          }
        }

        if (chunk.type === 'error' && chunk.content) {
          const providerErrorChunk = CommonErrors.providerUnreliable(this.getType(), chunk.content);
          yield {
            type: 'error',
            content: providerErrorChunk.details
              ? `${providerErrorChunk.message}: ${providerErrorChunk.details}`
              : providerErrorChunk.message,
          };
          return;
        }

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
