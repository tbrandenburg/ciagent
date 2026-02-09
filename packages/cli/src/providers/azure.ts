import { BaseProvider } from './base.js';
import { ExecutionConfig, ExecutionResult } from './types.js';

/**
 * Stub implementation for Azure OpenAI provider
 * To be fully implemented in Phase 2
 */
export class AzureProvider extends BaseProvider {
  readonly name = 'azure';
  readonly supportedModels = [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-35-turbo',
    'gpt-4o',
    'gpt-4o-mini'
  ];

  protected async doInitialize(_config: ExecutionConfig): Promise<void> {
    // Phase 2: Initialize Azure OpenAI client
    // - Set up authentication with API key or managed identity
    // - Validate endpoint and API version
    // - Test connection
  }

  async execute(_config: ExecutionConfig): Promise<ExecutionResult> {
    // Phase 1: Return stub response indicating not implemented
    return this.createErrorResult(
      'Azure OpenAI provider not yet implemented. This is expected in Phase 1.'
    );
  }

  protected validateProviderSpecific(config: ExecutionConfig): string[] {
    const errors: string[] = [];
    
    // Azure-specific validations for Phase 2:
    if (!config.apiKey && !config.endpoint) {
      errors.push('Azure provider requires either API key or endpoint configuration');
    }
    
    if (config.endpoint && !config.apiVersion) {
      errors.push('Azure provider requires api-version when using custom endpoint');
    }
    
    if (config.model && !this.supportedModels.includes(config.model)) {
      errors.push(`Unsupported model for Azure: ${config.model}. Supported: ${this.supportedModels.join(', ')}`);
    }
    
    return errors;
  }
}