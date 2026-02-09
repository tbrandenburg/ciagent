import { AIProvider, ExecutionConfig } from './types.js';
import { AzureProvider } from './azure.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import { LocalProvider } from './local.js';

/**
 * Registry for managing AI providers
 */
export class ProviderRegistry {
  private static providers: Map<string, AIProvider> = new Map();

  static {
    // Initialize providers
    this.providers.set('azure', new AzureProvider());
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('anthropic', new AnthropicProvider());
    this.providers.set('google', new GoogleProvider());
    this.providers.set('local', new LocalProvider());
  }

  /**
   * Get a provider by name
   */
  static getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  /**
   * Get all available provider names
   */
  static getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get supported models for a provider
   */
  static getSupportedModels(providerName: string): string[] {
    const provider = this.getProvider(providerName);
    return provider?.supportedModels || [];
  }

  /**
   * Validate that a provider exists and supports the given model
   */
  static validateProviderAndModel(providerName: string, model: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    const provider = this.getProvider(providerName);
    if (!provider) {
      errors.push(`Unknown provider: ${providerName}. Available: ${this.getAvailableProviders().join(', ')}`);
    } else if (!provider.supportedModels.includes(model)) {
      errors.push(`Model ${model} not supported by ${providerName}. Supported: ${provider.supportedModels.join(', ')}`);
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Execute a prompt with the specified provider
   */
  static async executeWithProvider(config: ExecutionConfig) {
    const provider = this.getProvider(config.provider);
    if (!provider) {
      throw new Error(`Provider ${config.provider} not found`);
    }

    // Initialize if not ready
    if (!provider.isReady()) {
      await provider.initialize(config);
    }

    return provider.execute(config);
  }
}