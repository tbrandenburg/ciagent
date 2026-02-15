import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { ExitCode } from '../../utils/exit-codes.js';

export interface CIAConfig {
  provider?: string;
  model?: string;
  mode?: 'lazy' | 'strict';
  format?: 'default' | 'json';
  context?: string[];
  'input-file'?: string;
  'schema-file'?: string;
  'schema-inline'?: string;
  'template-file'?: string;
  'template-vars'?: string;
  'template-vars-file'?: string;
  'output-file'?: string;
  'output-format'?: 'json' | 'yaml' | 'md' | 'text';
  retries?: number;
  'retry-backoff'?: boolean;
  'retry-timeout'?: number;
  'contract-validation'?: boolean;
  timeout?: number;
  endpoint?: string;
  'api-key'?: string;
  'api-version'?: string;
  org?: string;
  'log-level'?: string;
  providers?: {
    [providerName: string]: {
      model?: string;
      baseUrl?: string;
      apiKey?: string;
      timeout?: number;
      [key: string]: unknown;
    };
  };
  mcp?: {
    servers: Array<{
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }>;
  };
}

export function loadConfig(cliArgs: Partial<CIAConfig> = {}): CIAConfig {
  let config = loadFromEnv();

  const userConfig = loadUserConfig();
  if (userConfig) {
    config = mergeConfigs(config, userConfig);
  }

  const repoConfig = loadRepoConfig();
  if (repoConfig) {
    config = mergeConfigs(config, repoConfig);
  }

  config = mergeConfigs(config, cliArgs);

  return config;
}

function loadFromEnv(): Partial<CIAConfig> {
  const globalEnvPath = resolve(process.env.HOME ?? '~', '.cia', '.env');
  if (existsSync(globalEnvPath)) {
    loadDotEnvFile(globalEnvPath);
  }

  return {
    provider: process.env.CIA_PROVIDER,
    model: process.env.CIA_MODEL,
    mode: process.env.CIA_MODE as 'lazy' | 'strict',
    format: process.env.CIA_FORMAT as 'default' | 'json',
    'api-key': process.env.CIA_API_KEY,
    'api-version': process.env.CIA_API_VERSION,
    endpoint: process.env.CIA_ENDPOINT,
    org: process.env.CIA_ORG,
    'log-level': process.env.CIA_LOG_LEVEL,
    timeout: process.env.CIA_TIMEOUT ? parseInt(process.env.CIA_TIMEOUT, 10) : undefined,
    retries: process.env.CIA_RETRIES ? parseInt(process.env.CIA_RETRIES, 10) : undefined,
    'retry-timeout': process.env.CIA_RETRY_TIMEOUT
      ? parseInt(process.env.CIA_RETRY_TIMEOUT, 10)
      : undefined,
    'contract-validation': process.env.CIA_CONTRACT_VALIDATION === 'true',
  };
}

function loadDotEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, '');

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    const err = error as Error;
    console.error(`Error loading .env from ${filePath}: ${err.message}`);
    process.exit(ExitCode.AUTH_CONFIG);
  }
}

function loadUserConfig(): Partial<CIAConfig> | null {
  const userConfigPath = resolve(process.env.HOME ?? '~', '.cia', 'config.json');
  return loadConfigFile(userConfigPath);
}

function loadRepoConfig(): Partial<CIAConfig> | null {
  const repoConfigPath = resolve(process.cwd(), '.cia', 'config.json');
  return loadConfigFile(repoConfigPath);
}

function loadConfigFile(filePath: string): Partial<CIAConfig> | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as Partial<CIAConfig>;
  } catch (error) {
    const err = error as Error;
    console.error(`Error loading config from ${filePath}: ${err.message}`);
    process.exit(ExitCode.AUTH_CONFIG);
  }

  return null;
}

/**
 * Loads structured configuration sections (providers, mcp) with environment variable substitution.
 * Performs ${ENV_VAR} substitution in string values.
 */
export function loadStructuredConfig(config: CIAConfig): {
  providers?: CIAConfig['providers'];
  mcp?: CIAConfig['mcp'];
} {
  const result: { providers?: CIAConfig['providers']; mcp?: CIAConfig['mcp'] } = {};

  // Process providers configuration
  if (config.providers) {
    result.providers = {};
    for (const [providerName, providerConfig] of Object.entries(config.providers)) {
      result.providers[providerName] = substituteEnvironmentVariables(providerConfig);
    }
  }

  // Process MCP configuration
  if (config.mcp) {
    result.mcp = {
      servers: config.mcp.servers.map(server => substituteEnvironmentVariables(server)),
    };
  }

  return result;
}

/**
 * Recursively substitutes environment variables in configuration objects.
 * Replaces ${ENV_VAR} patterns with corresponding environment variable values.
 */
function substituteEnvironmentVariables<T>(obj: T): T {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const value = process.env[envVar];
      if (value === undefined) {
        console.error(
          `Warning: Environment variable ${envVar} is not defined, keeping placeholder`
        );
        return match;
      }
      return value;
    }) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => substituteEnvironmentVariables(item)) as T;
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvironmentVariables(value);
    }
    return result as T;
  }

  return obj;
}

function mergeConfigs(base: Partial<CIAConfig>, override: Partial<CIAConfig>): CIAConfig {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'context' && Array.isArray(value)) {
        merged.context = [...(merged.context || []), ...value];
      } else {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }

  return merged as CIAConfig;
}
