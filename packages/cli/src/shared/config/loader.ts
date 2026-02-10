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
