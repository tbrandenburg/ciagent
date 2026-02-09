import { BaseProvider } from './base.js';
import { ExecutionConfig, ExecutionResult } from './types.js';

/**
 * Stub implementation for Anthropic provider
 * To be fully implemented in Phase 2
 */
export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  readonly supportedModels = [
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'claude-3-5-sonnet'
  ];

  protected async doInitialize(_config: ExecutionConfig): Promise<void> {
    // Phase 2: Initialize Anthropic client
    // - Set up authentication with API key
    // - Test connection
  }

  async execute(_config: ExecutionConfig): Promise<ExecutionResult> {
    // Phase 1: Return stub response indicating not implemented
    return this.createErrorResult(
      'Anthropic provider not yet implemented. This is expected in Phase 1.'
    );
  }

  protected validateProviderSpecific(config: ExecutionConfig): string[] {
    const errors: string[] = [];
    
    // Anthropic-specific validations for Phase 2:
    if (!config.apiKey) {
      errors.push('Anthropic provider requires API key configuration');
    }
    
    if (config.model && !this.supportedModels.includes(config.model)) {
      errors.push(`Unsupported model for Anthropic: ${config.model}. Supported: ${this.supportedModels.join(', ')}`);
    }
    
    return errors;
  }
}