import type { LanguageModel } from 'ai';
import type { CIAConfig } from '../shared/config/loader.js';
import { createHttpClient } from '../utils/http-client';
import type { AxiosInstance } from 'axios';

type FetchFunction = typeof fetch;

function hasNetworkOverrides(network?: CIAConfig['network']): boolean {
  return Boolean(
    network?.['http-proxy'] ||
    network?.['https-proxy'] ||
    network?.['no-proxy']?.length ||
    network?.['ca-bundle-path']
  );
}

/**
 * Creates HTTP client with network configuration
 */
async function createNetworkClient(network?: CIAConfig['network']): Promise<AxiosInstance> {
  return createHttpClient(network, { timeout: 30000, retries: 3 });
}

/**
 * Convert axios client to fetch-compatible function for AI SDK
 */
function axiosToFetch(client: AxiosInstance): FetchFunction {
  return async (url: string | URL | Request, init?: RequestInit) => {
    try {
      const response = await client.request({
        url: url.toString(),
        method: init?.method || 'GET',
        data: init?.body,
        headers: init?.headers as Record<string, string>,
      });

      return new Response(JSON.stringify(response.data), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as Record<string, string>,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`HTTP request failed: ${message}`);
    }
  };
}

async function createNetworkFetch(
  network?: CIAConfig['network']
): Promise<FetchFunction | undefined> {
  if (!network || !hasNetworkOverrides(network)) {
    return undefined;
  }

  // Set CA bundle if specified
  if (network['ca-bundle-path']) {
    process.env.NODE_EXTRA_CA_CERTS = network['ca-bundle-path'];
  }

  const client = await createNetworkClient(network);
  return axiosToFetch(client);
}

/**
 * Provider configuration for Vercel AI SDK providers
 */
export interface VercelProviderConfig {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  // Azure-specific options
  resourceName?: string;
  // OpenAI-specific options
  organization?: string;
  // Google-specific options
  projectId?: string;
  // Anthropic-specific options
  version?: string;
  [key: string]: unknown;
}

/**
 * Extensible factory for creating Vercel AI SDK provider instances
 * Adding new providers requires only adding to the switch statement and dependency
 */
export class VercelProviderFactory {
  /**
   * Create a Vercel provider instance based on type
   * @param type - Provider type ('azure', 'openai', 'google', 'anthropic', etc.)
   * @param config - Provider-specific configuration
   * @returns LanguageModel instance for the specified provider
   */
  static async createProvider(
    type: string,
    config?: VercelProviderConfig,
    network?: CIAConfig['network']
  ): Promise<LanguageModel> {
    const networkFetch = await createNetworkFetch(network);

    switch (type) {
      case 'azure': {
        const azureModule = await import('@ai-sdk/azure');

        if (config?.resourceName || config?.apiKey) {
          // Custom configuration
          const azureProvider = azureModule.createAzure({
            resourceName: config.resourceName,
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
            ...(networkFetch && { fetch: networkFetch }),
          });
          return azureProvider(config?.model || 'gpt-4o');
        } else {
          if (networkFetch) {
            const azureProvider = azureModule.createAzure({
              ...(networkFetch && { fetch: networkFetch }),
            });
            return azureProvider(config?.model || 'gpt-4o');
          }

          // Default configuration using environment variables
          return azureModule.azure(config?.model || 'gpt-4o');
        }
      }

      case 'openai': {
        const openaiModule = await import('@ai-sdk/openai');

        // Default to LLMv7 endpoint if no custom config is provided
        const defaultConfig = {
          baseURL: 'https://api.llm7.io/v1',
          model: 'gpt-4',
          apiKey: 'sk-dummy', // LLMv7 doesn't require a real API key, but SDK might need format
        };

        if (config?.apiKey || config?.organization || config?.baseUrl) {
          // Custom configuration
          const openaiProvider = openaiModule.createOpenAI({
            apiKey: config.apiKey || defaultConfig.apiKey,
            organization: config.organization,
            baseURL: config.baseUrl || defaultConfig.baseURL,
            ...(networkFetch && { fetch: networkFetch }),
          });
          return openaiProvider(config?.model || defaultConfig.model);
        } else {
          // Use LLMv7 endpoint as default
          const openaiProvider = openaiModule.createOpenAI({
            apiKey: defaultConfig.apiKey,
            baseURL: defaultConfig.baseURL,
            ...(networkFetch && { fetch: networkFetch }),
          });
          return openaiProvider(defaultConfig.model);
        }
      }

      // Future providers will be added here with dynamic imports:
      // case 'openai': {
      //   const openaiModule = await import('@ai-sdk/openai');
      //   if (config?.apiKey || config?.organization || config?.baseUrl) {
      //     const openaiProvider = openaiModule.createOpenAI({
      //       apiKey: config.apiKey,
      //       organization: config.organization,
      //       baseURL: config.baseUrl,
      //     });
      //     return openaiProvider(config?.model || 'gpt-4o');
      //   } else {
      //     return openaiModule.openai(config?.model || 'gpt-4o');
      //   }
      // }
      //
      // case 'google': {
      //   const googleModule = await import('@ai-sdk/google');
      //   if (config?.apiKey || config?.projectId) {
      //     const googleProvider = googleModule.createGoogleGenerativeAI({
      //       apiKey: config.apiKey,
      //     });
      //     return googleProvider(config?.model || 'gemini-1.5-pro');
      //   } else {
      //     return googleModule.google(config?.model || 'gemini-1.5-pro');
      //   }
      // }
      //
      // case 'anthropic': {
      //   const anthropicModule = await import('@ai-sdk/anthropic');
      //   if (config?.apiKey || config?.version) {
      //     const anthropicProvider = anthropicModule.createAnthropic({
      //       apiKey: config.apiKey,
      //       version: config.version,
      //     });
      //     return anthropicProvider(config?.model || 'claude-3-5-sonnet-20241022');
      //   } else {
      //     return anthropicModule.anthropic(config?.model || 'claude-3-5-sonnet-20241022');
      //   }
      // }

      default:
        throw new Error(
          `Unsupported Vercel provider: ${type}. Currently supported: azure, openai. Future support planned for: google, anthropic`
        );
    }
  }

  /**
   * Get list of supported provider types
   * @returns Array of supported provider type strings
   */
  static getSupportedProviders(): string[] {
    return ['azure']; // Will expand to ['azure', 'openai', 'google', 'anthropic'] as dependencies are added
  }

  /**
   * List available models for a specific Vercel provider type
   * @param type - Provider type ('azure', 'openai', 'google', 'anthropic')
   * @param config - Optional provider configuration
   * @returns Promise<string[]> Array of available model names
   */
  static async listModels(type: string, config?: VercelProviderConfig): Promise<string[]> {
    // TODO: Use config for provider-specific authentication in future iterations
    void config; // Acknowledge config parameter for interface compatibility

    switch (type) {
      case 'azure': {
        try {
          // Azure OpenAI uses deployments, which are custom per tenant
          // For now, return common Azure OpenAI model deployments
          return ['gpt-4o', 'gpt-4o-mini', 'gpt-35-turbo'];
        } catch {
          return ['gpt-4o'];
        }
      }

      // Future providers (commented out until dependencies are added):
      // case 'openai': {
      //   try {
      //     const openaiModule = await import('@ai-sdk/openai');
      //     // OpenAI model listing would go here
      //     return ['gpt-4o', 'gpt-4o-mini', 'gpt-35-turbo'];
      //   } catch {
      //     return ['gpt-4o'];
      //   }
      // }

      // case 'google': {
      //   try {
      //     return ['gemini-1.5-pro', 'gemini-1.5-flash'];
      //   } catch {
      //     return ['gemini-1.5-pro'];
      //   }
      // }

      // case 'anthropic': {
      //   try {
      //     return ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];
      //   } catch {
      //     return ['claude-3-5-sonnet-20241022'];
      //   }
      // }

      default:
        // Return empty array for unsupported providers
        return [];
    }
  }
}
