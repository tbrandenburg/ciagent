import { BaseProvider } from './base.js';
import { ExecutionConfig, ExecutionResult } from './types.js';

/**
 * Stub implementation for Local provider (Ollama, local models)
 * To be fully implemented in Phase 2
 */
export class LocalProvider extends BaseProvider {
  readonly name = 'local';
  readonly supportedModels = [
    'llama2',
    'llama3',
    'codellama',
    'mistral',
    'neural-chat',
    'starling-lm'
  ];

  protected async doInitialize(_config: ExecutionConfig): Promise<void> {
    // Phase 2: Initialize local model client
    // - Connect to local Ollama instance or model server
    // - Verify model is available/downloaded
    // - Test connection
  }

  async execute(_config: ExecutionConfig): Promise<ExecutionResult> {
    // Phase 1: Return stub response indicating not implemented
    return this.createErrorResult(
      'Local provider not yet implemented. This is expected in Phase 1.'
    );
  }

  protected validateProviderSpecific(config: ExecutionConfig): string[] {
    const errors: string[] = [];
    
    // Local-specific validations for Phase 2:
    if (!config.endpoint) {
      // Default to localhost:11434 for Ollama if no endpoint specified
      errors.push('Local provider should specify endpoint (defaults to localhost:11434 for Ollama)');
    }
    
    if (config.model && !this.supportedModels.includes(config.model)) {
      errors.push(`Unsupported model for Local: ${config.model}. Supported: ${this.supportedModels.join(', ')}`);
    }
    
    return errors;
  }
}