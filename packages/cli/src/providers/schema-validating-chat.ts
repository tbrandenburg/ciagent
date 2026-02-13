/**
 * Schema validation wrapper for IAssistantChat providers
 *
 * Wraps any IAssistantChat provider with JSON Schema validation capabilities,
 * buffering assistant responses for validation while preserving streaming
 * behavior for all other chunk types.
 */

import pRetry, { AbortError } from 'p-retry';
import { IAssistantChat, ChatChunk, Message } from './types.js';
import { SchemaValidator, SchemaValidationResult } from '../shared/validation/schema-validator.js';
import { JSONSchema7 } from 'json-schema';

/**
 * Configuration for schema validation
 */
export interface SchemaValidationConfig {
  /** JSON Schema to validate against - if not provided, no validation is performed */
  schema?: JSONSchema7;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Use exponential backoff for retries */
  useBackoff?: boolean;
  /** Retry timeout in milliseconds */
  retryTimeout?: number;
}

/**
 * Schema validation wrapper that implements IAssistantChat
 *
 * Buffers assistant chunk content for complete JSON validation while
 * preserving the streaming AsyncGenerator interface for all other chunk types.
 * Uses proven retry patterns from reliability.ts and ai-first-devops-toolkit.
 */
export class SchemaValidatingChat implements IAssistantChat {
  private provider: IAssistantChat;
  private validator: SchemaValidator;
  private config: SchemaValidationConfig;

  constructor(provider: IAssistantChat, config: SchemaValidationConfig) {
    this.provider = provider;
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      useBackoff: config.useBackoff ?? true,
      retryTimeout: config.retryTimeout ?? 30000,
      schema: config.schema,
    };
    this.validator = new SchemaValidator();
  }

  async *sendQuery(
    input: string | Message[],
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    // If no schema provided, just pass through all chunks without validation
    if (!this.config.schema) {
      const queryIterable =
        typeof input === 'string'
          ? this.provider.sendQuery(input, cwd, resumeSessionId)
          : this.provider.sendQuery(input, cwd, resumeSessionId);

      for await (const chunk of queryIterable) {
        yield chunk;
      }
      return;
    }

    let isNonRetryableError = false;
    let finalErrorMessage = '';

    try {
      const result = await pRetry(
        async (): Promise<ChatChunk[]> => {
          const allChunks: ChatChunk[] = [];
          const assistantChunks: ChatChunk[] = [];
          let hasError = false;

          try {
            // Call provider with appropriate overload
            const queryIterable =
              typeof input === 'string'
                ? this.provider.sendQuery(input, cwd, resumeSessionId)
                : this.provider.sendQuery(input, cwd, resumeSessionId);

            for await (const chunk of queryIterable) {
              allChunks.push(chunk);

              // Check for error chunks
              if (chunk.type === 'error' && chunk.content) {
                hasError = true;
              }

              // Buffer assistant chunks for validation
              if (chunk.type === 'assistant') {
                assistantChunks.push(chunk);
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

          // If we collected error chunks, they should be passed through immediately
          // Error chunks from the provider are not retryable - they represent final errors
          if (hasError) {
            return allChunks;
          }

          // Validate assistant response if we have schema and content
          if (assistantChunks.length > 0 && this.config.schema) {
            const assistantContent = assistantChunks.map(chunk => chunk.content || '').join('');

            const validationResult = this.validator.validate(assistantContent, this.config.schema);

            if (!validationResult.isValid) {
              const validationErrorMsg = this.formatValidationErrors(validationResult);

              // Check if this error should stop retries
              if (this.isNonRetryableError(validationErrorMsg)) {
                isNonRetryableError = true;
                finalErrorMessage = validationErrorMsg;
                throw new AbortError(validationErrorMsg);
              }

              // Throw retriable error
              throw new Error(validationErrorMsg);
            }
          }

          return allChunks;
        },
        {
          retries: this.config.maxRetries,
          factor: this.config.useBackoff ? 2 : 1,
          minTimeout: this.config.useBackoff ? 1000 : 500,
          maxTimeout: this.config.retryTimeout,
          randomize: this.config.useBackoff,
          onFailedAttempt: () => {
            // Log retry attempts for debugging (following reliability.ts pattern)
            // Optional: Add logging here if needed
          },
        }
      );

      // Stream all chunks in the correct order
      for (const chunk of result) {
        yield chunk;
      }
    } catch (error) {
      // Check if we marked this as non-retryable
      if (isNonRetryableError) {
        throw new Error(`Schema validation error: ${finalErrorMessage}`);
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Schema validation failed after ${this.config.maxRetries} retries: ${errorMessage}`
        );
      }
    }
  }

  /**
   * Check if an error should not be retried
   *
   * Based on patterns from reliability.ts with additions for schema validation
   */
  private isNonRetryableError(message: string): boolean {
    const nonRetryablePatterns = [
      'authentication',
      'authorization',
      'forbidden',
      'not found',
      'invalid api key',
      'quota exceeded',
      'rate limit',
      'billing',
      'payment',
      'subscription',
    ];

    const lowerMessage = message.toLowerCase();
    return nonRetryablePatterns.some(pattern => lowerMessage.includes(pattern));
  }

  /**
   * Format validation errors into a readable string
   */
  private formatValidationErrors(result: SchemaValidationResult): string {
    if (result.isValid) {
      return '';
    }

    if (result.errors && result.errors.length > 0) {
      return result.errors.map(err => `${err.instancePath || '(root)'}: ${err.message}`).join('; ');
    }

    return 'Unknown validation error';
  }

  getType(): string {
    return this.provider.getType();
  }
}
