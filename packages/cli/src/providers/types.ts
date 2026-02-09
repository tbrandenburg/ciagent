/**
 * Configuration for AI provider execution
 */
export interface ExecutionConfig {
  provider: 'azure' | 'openai' | 'anthropic' | 'google' | 'local';
  model: string;
  prompt: string;
  context?: string[];
  mode: 'lazy' | 'strict';
  schemaFile?: string;
  schemaInline?: string;
  outputFormat?: 'json' | 'yaml' | 'md' | 'text';
  retries: number;
  retryBackoff: boolean;
  timeout: number;
  endpoint?: string;
  apiKey?: string;
  apiVersion?: string;
  org?: string;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

/**
 * Result from AI provider execution
 */
export interface ExecutionResult {
  success: boolean;
  content?: string;
  error?: string;
  metadata?: {
    model: string;
    provider: string;
    duration: number;
    tokens?: {
      input: number;
      output: number;
    };
  };
}

/**
 * Base interface for AI providers
 */
export interface AIProvider {
  readonly name: string;
  readonly supportedModels: string[];
  
  /**
   * Initialize the provider with configuration
   */
  initialize(config: ExecutionConfig): Promise<void>;
  
  /**
   * Execute an AI prompt
   */
  execute(config: ExecutionConfig): Promise<ExecutionResult>;
  
  /**
   * Validate provider-specific configuration
   */
  validateConfig(config: ExecutionConfig): { isValid: boolean; errors: string[] };
  
  /**
   * Check if the provider is properly configured and ready
   */
  isReady(): boolean;
}