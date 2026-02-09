import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { ExitCode } from '../utils/exit-codes.js';

export interface CIAConfig {
  provider?: string;
  model?: string;
  mode?: 'lazy' | 'strict';
  format?: 'default' | 'json';
  context?: string[];
  'input-file'?: string;
  'schema-file'?: string;
  'schema-inline'?: string;
  'output-file'?: string;
  'output-format'?: 'json' | 'yaml' | 'md' | 'text';
  retries?: number;
  'retry-backoff'?: boolean;
  timeout?: number;
  endpoint?: string;
  'api-key'?: string;
  'api-version'?: string;
  org?: string;
  'log-level'?: string;
}

/**
 * Load configuration from hierarchy: CLI flags > repo config > user config > env vars
 * Per CLI spec requirements
 */
export function loadConfig(cliArgs: Partial<CIAConfig> = {}): CIAConfig {
  // Start with environment variables (lowest priority)
  let config = loadFromEnv();

  // Merge user config (~/.cia/config.json)
  const userConfig = loadUserConfig();
  if (userConfig) {
    config = mergeConfigs(config, userConfig);
  }

  // Merge repo config (.cia/config.json)
  const repoConfig = loadRepoConfig();
  if (repoConfig) {
    config = mergeConfigs(config, repoConfig);
  }

  // Merge CLI arguments (highest priority)
  config = mergeConfigs(config, cliArgs);

  return config;
}

/**
 * Load configuration from environment variables
 */
function loadFromEnv(): Partial<CIAConfig> {
  // Load .env from global CIA config only
  const globalEnvPath = resolve(process.env.HOME ?? '~', '.cia', '.env');
  if (existsSync(globalEnvPath)) {
    const result = config({ path: globalEnvPath });
    if (result.error) {
      console.error(`Error loading .env from ${globalEnvPath}: ${result.error.message}`);
      process.exit(ExitCode.AUTH_CONFIG);
    }
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
  };
}

/**
 * Load user configuration from ~/.cia/config.json
 */
function loadUserConfig(): Partial<CIAConfig> | null {
  const userConfigPath = resolve(process.env.HOME ?? '~', '.cia', 'config.json');
  return loadConfigFile(userConfigPath);
}

/**
 * Load repository configuration from .cia/config.json
 */
function loadRepoConfig(): Partial<CIAConfig> | null {
  const repoConfigPath = resolve(process.cwd(), '.cia', 'config.json');
  return loadConfigFile(repoConfigPath);
}

/**
 * Load configuration from a JSON file
 */
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
}

/**
 * Merge two config objects, with second taking precedence
 */
function mergeConfigs(base: Partial<CIAConfig>, override: Partial<CIAConfig>): CIAConfig {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'context' && Array.isArray(value)) {
        // For array fields like context, concatenate
        merged.context = [...(merged.context || []), ...value];
      } else {
        (merged as any)[key] = value;
      }
    }
  }

  return merged as CIAConfig;
}
