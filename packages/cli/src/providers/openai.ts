import { BaseProvider } from './base.js';
import { ExecutionConfig, ExecutionResult } from './types.js';

/**
 * Stub implementation for OpenAI provider
 * To be fully implemented in Phase 2
 */
export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  readonly supportedModels = [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'gpt-4o',
    'gpt-4o-mini'
  ];

  protected async doInitialize(_config: ExecutionConfig): Promise<void> {
    // Phase 2: Initialize OpenAI client
    // - Set up authentication with API key
    // - Validate organization ID if provided
    // - Test connection
  }

  async execute(_config: ExecutionConfig): Promise<ExecutionResult> {
    // Phase 1: Return stub response indicating not implemented
    return this.createErrorResult(
      'OpenAI provider not yet implemented. This is expected in Phase 1.'
    );
  }

  protected validateProviderSpecific(config: ExecutionConfig): string[] {
    const errors: string[] = [];
    
    // OpenAI-specific validations for Phase 2:
    if (!config.apiKey) {
      errors.push('OpenAI provider requires API key configuration');
    }
    
    if (config.model && !this.supportedModels.includes(config.model)) {
      errors.push(`Unsupported model for OpenAI: ${config.model}. Supported: ${this.supportedModels.join(', ')}`);
    }
    
    return errors;
  }
}