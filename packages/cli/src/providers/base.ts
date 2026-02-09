import { AIProvider, ExecutionConfig, ExecutionResult } from './types.js';

/**
 * Base implementation for AI providers with common functionality
 */
export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly supportedModels: string[];
  
  protected config?: ExecutionConfig;
  protected ready: boolean = false;

  async initialize(config: ExecutionConfig): Promise<void> {
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(`Provider initialization failed: ${validation.errors.join(', ')}`);
    }
    
    this.config = config;
    await this.doInitialize(config);
    this.ready = true;
  }

  abstract execute(config: ExecutionConfig): Promise<ExecutionResult>;

  validateConfig(config: ExecutionConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Common validations
    if (!config.model) {
      errors.push('Model is required');
    }
    
    if (!config.prompt) {
      errors.push('Prompt is required');
    }
    
    if (config.mode === 'strict' && !config.schemaFile && !config.schemaInline) {
      errors.push('Strict mode requires either schema-file or schema-inline parameter');
    }
    
    // Provider-specific validations
    const providerErrors = this.validateProviderSpecific(config);
    errors.push(...providerErrors);
    
    return { isValid: errors.length === 0, errors };
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Provider-specific initialization logic
   */
  protected abstract doInitialize(config: ExecutionConfig): Promise<void>;

  /**
   * Provider-specific configuration validation
   */
  protected abstract validateProviderSpecific(config: ExecutionConfig): string[];

  /**
   * Create a standardized error result
   */
  protected createErrorResult(error: string): ExecutionResult {
    return {
      success: false,
      error,
      metadata: {
        provider: this.name,
        model: this.config?.model || 'unknown',
        duration: 0,
      },
    };
  }

  /**
   * Create a standardized success result
   */
  protected createSuccessResult(content: string, duration: number): ExecutionResult {
    return {
      success: true,
      content,
      metadata: {
        provider: this.name,
        model: this.config?.model || 'unknown',
        duration,
      },
    };
  }
}