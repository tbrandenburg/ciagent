import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { ExitCode } from '../../utils/exit-codes.js';
import { MCPServerConfig, SkillsConfig, ToolRegistryConfig } from './schema.js';

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
  verbose?: boolean;
  skill?: string;
  network?: {
    'http-proxy'?: string;
    'https-proxy'?: string;
    'no-proxy'?: string[];
    'ca-bundle-path'?: string;
    'use-env-proxy'?: boolean;
  };
  providers?: {
    [providerName: string]: {
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
    };
  };
  mcp?:
    | {
        servers: MCPServerConfig[];
      }
    | Record<string, Omit<MCPServerConfig, 'name'>>;
  skills?: SkillsConfig;
  tools?: ToolRegistryConfig;
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

  const network = loadNetworkConfigFromEnv();

  return {
    ...(network && { network }),
  };
}

function loadNetworkConfigFromEnv(): CIAConfig['network'] | undefined {
  const httpProxy = readNonEmptyEnv('HTTP_PROXY');
  const httpsProxy = readNonEmptyEnv('HTTPS_PROXY');
  const noProxy = parseNoProxy(process.env.NO_PROXY);
  const caBundlePath = readNonEmptyEnv('NODE_EXTRA_CA_CERTS');
  const useEnvProxy = parseBooleanEnv(process.env.NODE_USE_ENV_PROXY);

  if (!httpProxy && !httpsProxy && !noProxy && !caBundlePath && useEnvProxy === undefined) {
    return undefined;
  }

  return {
    ...(httpProxy && { 'http-proxy': httpProxy }),
    ...(httpsProxy && { 'https-proxy': httpsProxy }),
    ...(noProxy && { 'no-proxy': noProxy }),
    ...(caBundlePath && { 'ca-bundle-path': caBundlePath }),
    ...(useEnvProxy !== undefined && { 'use-env-proxy': useEnvProxy }),
  };
}

function readNonEmptyEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseNoProxy(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);

  return parsed.length > 0 ? parsed : undefined;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') {
    return true;
  }
  if (normalized === '0' || normalized === 'false') {
    return false;
  }
  return undefined;
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
 * Loads structured configuration sections (providers, mcp, skills, tools) with environment variable substitution.
 * Performs ${ENV_VAR} substitution in string values.
 */
export function loadStructuredConfig(config: CIAConfig): {
  providers?: CIAConfig['providers'];
  mcp?: CIAConfig['mcp'];
  skills?: CIAConfig['skills'];
  tools?: CIAConfig['tools'];
} {
  const result: {
    providers?: CIAConfig['providers'];
    mcp?: CIAConfig['mcp'];
    skills?: CIAConfig['skills'];
    tools?: CIAConfig['tools'];
  } = {};

  // Process providers configuration
  if (config.providers) {
    result.providers = {};
    for (const [providerName, providerConfig] of Object.entries(config.providers)) {
      result.providers[providerName] = substituteEnvironmentVariables(providerConfig);
    }
  }

  // Process MCP configuration (support both array and object-based formats)
  if (config.mcp) {
    if ('servers' in config.mcp && Array.isArray(config.mcp.servers)) {
      // CIA Agent format: { mcp: { servers: [...] } }
      result.mcp = {
        servers: config.mcp.servers.map(server => substituteEnvironmentVariables(server)),
      };
    } else {
      // OpenCode format: { mcp: { serverName: { type: "local", ... }, ... } }
      const servers: MCPServerConfig[] = [];
      for (const [serverName, serverConfig] of Object.entries(config.mcp as Record<string, any>)) {
        if (typeof serverConfig === 'object' && serverConfig !== null && 'type' in serverConfig) {
          servers.push(
            substituteEnvironmentVariables({
              name: serverName,
              ...serverConfig,
            })
          );
        }
      }
      result.mcp = { servers };
    }
  }

  // Process Skills configuration
  if (config.skills) {
    result.skills = {
      sources: config.skills.sources?.map(source => substituteEnvironmentVariables(source)),
      paths: config.skills.paths?.map(path => substituteEnvironmentVariables(path)),
      urls: config.skills.urls?.map(url => substituteEnvironmentVariables(url)),
    };
  }

  // Process Tools configuration
  if (config.tools) {
    result.tools = substituteEnvironmentVariables(config.tools);
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

/**
 * Determines if the current execution context is interactive terminal usage
 * vs CI/automation environment that benefits from retry reliability
 */
export function isInteractiveContext(): boolean {
  // Not interactive if no TTY (piped/redirected input)
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    return false;
  }

  // Common CI environment indicators
  const ciEnvironments = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'JENKINS_URL',
    'BUILDKITE',
    'CIRCLECI',
    'TRAVIS',
    'APPVEYOR',
  ];

  // Not interactive if running in CI
  if (ciEnvironments.some(env => process.env[env])) {
    return false;
  }

  return true;
}
