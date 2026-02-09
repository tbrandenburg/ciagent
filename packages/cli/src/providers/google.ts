import { BaseProvider } from './base.js';
import { ExecutionConfig, ExecutionResult } from './types.js';

/**
 * Stub implementation for Google provider
 * To be fully implemented in Phase 2
 */
export class GoogleProvider extends BaseProvider {
  readonly name = 'google';
  readonly supportedModels = [
    'gemini-pro',
    'gemini-pro-vision',
    'gemini-1.5-pro',
    'gemini-1.5-flash'
  ];

  protected async doInitialize(_config: ExecutionConfig): Promise<void> {
    // Phase 2: Initialize Google AI client
    // - Set up authentication with API key or service account
    // - Validate project ID if required
    // - Test connection
  }

  async execute(_config: ExecutionConfig): Promise<ExecutionResult> {
    // Phase 1: Return stub response indicating not implemented
    return this.createErrorResult(
      'Google provider not yet implemented. This is expected in Phase 1.'
    );
  }

  protected validateProviderSpecific(config: ExecutionConfig): string[] {
    const errors: string[] = [];
    
    // Google-specific validations for Phase 2:
    if (!config.apiKey) {
      errors.push('Google provider requires API key configuration');
    }
    
    if (config.model && !this.supportedModels.includes(config.model)) {
      errors.push(`Unsupported model for Google: ${config.model}. Supported: ${this.supportedModels.join(', ')}`);
    }
    
    return errors;
  }
}