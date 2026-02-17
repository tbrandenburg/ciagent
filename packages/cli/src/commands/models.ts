import { createAssistantChat, getSupportedProviders } from '../providers/index.js';
import { loadStructuredConfig, type CIAConfig } from '../shared/config/loader.js';
import { CommonErrors, printError } from '../shared/errors/error-handling.js';
import { ExitCode } from '../utils/exit-codes.js';

export async function modelsCommand(config: CIAConfig): Promise<number> {
  try {
    // Get list of providers to query (support for --provider filter)
    const supportedProviders = getSupportedProviders();
    const providersToQuery = config.provider
      ? [config.provider] // Filter to specific provider if specified
      : supportedProviders; // Otherwise query all supported providers

    // Validate provider filter
    if (config.provider && !supportedProviders.includes(config.provider)) {
      const error = CommonErrors.invalidArgument(
        'provider',
        `one of: ${supportedProviders.join(', ')}`
      );
      printError(error);
      return error.code;
    }

    const allModels: string[] = [];

    // DUAL Discovery System: API Discovery + Config Discovery

    // 1. API Discovery: Call listModels() on each provider
    const apiDiscoveryPromises = providersToQuery.map(async provider => {
      try {
        const assistant = await createAssistantChat(provider, config);
        const models = await assistant.listModels();
        // Format with slash notation (BREAKING CHANGE from colon to slash)
        return models.map(model => `${provider}/${model}`);
      } catch (error) {
        // Handle individual provider failures gracefully
        // Log error but continue with other providers
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (process.env.DEBUG) {
          console.error(`Provider ${provider} model discovery failed: ${errorMsg}`);
        }
        return []; // Return empty array for failed providers
      }
    });

    // Wait for all API discoveries to complete
    const apiResults = await Promise.allSettled(apiDiscoveryPromises);
    for (const result of apiResults) {
      if (result.status === 'fulfilled') {
        allModels.push(...result.value);
      }
    }

    // 2. Config Discovery: Extract custom models from config.providers
    try {
      const structuredConfig = loadStructuredConfig(config);
      if (structuredConfig?.providers) {
        for (const [providerName, providerConfig] of Object.entries(structuredConfig.providers)) {
          // Only include providers that match the filter (if any)
          if (config.provider && config.provider !== providerName) {
            continue;
          }

          // Look for custom models in provider config
          if (providerConfig && typeof providerConfig === 'object' && 'models' in providerConfig) {
            const models = providerConfig.models as Record<string, any>;
            if (models && typeof models === 'object') {
              for (const modelName of Object.keys(models)) {
                // Format with slash notation
                allModels.push(`${providerName}/${modelName}`);
              }
            }
          }
        }
      }
    } catch (error) {
      // Config parsing errors shouldn't fail the entire command
      if (process.env.DEBUG) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Config discovery failed: ${errorMsg}`);
      }
    }

    // 3. Aggregate: Remove duplicates and sort by provider/model
    const uniqueModels = [...new Set(allModels)].sort();

    // Handle empty results
    if (uniqueModels.length === 0) {
      if (config.provider) {
        const error = CommonErrors.executionFailed(
          `No models found for provider: ${config.provider}. Check provider configuration and network connection.`
        );
        printError(error);
        return error.code;
      } else {
        const error = CommonErrors.executionFailed(
          'No models found from any provider. Check provider configurations and network connection.'
        );
        printError(error);
        return error.code;
      }
    }

    // Output in requested format
    if (config.format === 'json') {
      console.log(JSON.stringify({ models: uniqueModels }, null, 2));
    } else {
      // Default format: One model per line
      uniqueModels.forEach(model => console.log(model));
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const modelError = CommonErrors.executionFailed(`Model listing failed: ${errorMsg}`);
    printError(modelError);
    return modelError.code;
  }
}
