import { existsSync, readFileSync } from 'fs';
import { CIAConfig } from '../config/loader.js';
import { resolveContextInput } from '../../utils/context-processors.js';
import { validateGitHubUrl } from '../../utils/github-api.js';
import { isValidPath, pathExists } from '../../utils/file-utils.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateConfig(config: CIAConfig): ValidationResult {
  const errors: string[] = [];
  // Extensible provider list - matches the VERCEL_PROVIDERS + existing providers
  const validProviders = ['azure', 'openai', 'codex', 'claude'];

  if (config.mode && !['lazy', 'strict'].includes(config.mode)) {
    errors.push(`Invalid mode: ${config.mode}. Must be 'lazy' or 'strict'.`);
  }

  if (config.format && !['default', 'json'].includes(config.format)) {
    errors.push(`Invalid format: ${config.format}. Must be 'default' or 'json'.`);
  }

  if (config.provider && !validProviders.includes(config.provider)) {
    errors.push(
      `Invalid provider: ${config.provider}. Must be one of: ${validProviders.join(', ')}.`
    );
  }

  if (
    config['output-format'] &&
    !['json', 'yaml', 'md', 'text'].includes(config['output-format'])
  ) {
    errors.push(
      `Invalid output-format: ${config['output-format']}. Must be 'json', 'yaml', 'md', or 'text'.`
    );
  }

  if (config['log-level']) {
    const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (!validLogLevels.includes(config['log-level'])) {
      errors.push(
        `Invalid log-level: ${config['log-level']}. Must be one of: ${validLogLevels.join(', ')}.`
      );
    }
  }

  if (config.mode === 'strict') {
    if (!config['schema-file'] && !config['schema-inline']) {
      errors.push('Strict mode requires either --schema-file or --schema-inline to be specified.');
    }
  }

  if (config['schema-file']) {
    if (!existsSync(config['schema-file'])) {
      errors.push(`Schema file not found: ${config['schema-file']}`);
    } else if (!config['schema-file'].endsWith('.json')) {
      errors.push(`Schema file must be a JSON file: ${config['schema-file']}`);
    }
  }

  if (config['input-file']) {
    if (!existsSync(config['input-file'])) {
      errors.push(`Input file not found: ${config['input-file']}`);
    }
  }

  if (config['schema-inline']) {
    try {
      JSON.parse(config['schema-inline']);
    } catch (error) {
      errors.push('Invalid JSON in --schema-inline option.');
    }
  }

  if (config['template-file']) {
    if (!existsSync(config['template-file'])) {
      errors.push(`Template file not found: ${config['template-file']}`);
    }
  }

  if (config['template-vars-file']) {
    if (!existsSync(config['template-vars-file'])) {
      errors.push(`Template variables file not found: ${config['template-vars-file']}`);
    } else if (!config['template-vars-file'].endsWith('.json')) {
      errors.push(`Template variables file must be a JSON file: ${config['template-vars-file']}`);
    } else {
      try {
        const content = readFileSync(config['template-vars-file'], 'utf8');
        JSON.parse(content);
      } catch (error) {
        errors.push(`Invalid JSON in template variables file: ${config['template-vars-file']}`);
      }
    }
  }

  if (config['template-vars']) {
    try {
      JSON.parse(config['template-vars']);
    } catch (error) {
      errors.push('Invalid JSON in --template-vars option.');
    }
  }

  if (config.timeout !== undefined) {
    if (isNaN(config.timeout) || config.timeout <= 0) {
      errors.push(`Invalid timeout: ${config.timeout}. Must be a positive number.`);
    }
  }

  if (config.retries !== undefined) {
    if (isNaN(config.retries) || config.retries < 0) {
      errors.push(`Invalid retries: ${config.retries}. Must be a non-negative number.`);
    }
  }

  if (config.network) {
    errors.push(...validateNetworkConfig(config.network));
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateNetworkConfig(network: NonNullable<CIAConfig['network']>): string[] {
  const errors: string[] = [];

  const proxyEntries: Array<{ key: 'http-proxy' | 'https-proxy'; value: string | undefined }> = [
    { key: 'http-proxy', value: network['http-proxy'] },
    { key: 'https-proxy', value: network['https-proxy'] },
  ];

  for (const { key, value } of proxyEntries) {
    if (!value) {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      errors.push(`Invalid network.${key}: value cannot be empty.`);
      continue;
    }

    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push(`Invalid network.${key}: proxy URL must use http:// or https://.`);
      }
    } catch {
      errors.push(`Invalid network.${key}: must be a valid URL.`);
    }
  }

  if (network['no-proxy']) {
    if (!Array.isArray(network['no-proxy'])) {
      errors.push('Invalid network.no-proxy: must be an array of host patterns.');
    } else {
      for (const entry of network['no-proxy']) {
        if (typeof entry !== 'string' || !entry.trim()) {
          errors.push('Invalid network.no-proxy: entries must be non-empty strings.');
          break;
        }
      }
    }
  }

  if (network['ca-bundle-path'] !== undefined) {
    const caBundlePath = network['ca-bundle-path'];
    if (typeof caBundlePath !== 'string' || !caBundlePath.trim()) {
      errors.push('Invalid network.ca-bundle-path: value cannot be empty.');
    } else if (/\r|\n/.test(caBundlePath)) {
      errors.push('Invalid network.ca-bundle-path: value must be a single path string.');
    }
  }

  if (network['use-env-proxy'] !== undefined && typeof network['use-env-proxy'] !== 'boolean') {
    errors.push('Invalid network.use-env-proxy: must be a boolean.');
  }

  return errors;
}

export function validateProvider(provider?: string): ValidationResult {
  // Extensible provider list - matches the VERCEL_PROVIDERS + existing providers
  const validProviders = ['azure', 'openai', 'codex', 'claude'];

  if (!provider) {
    return { isValid: false, errors: ['Provider is required'] };
  }

  if (!validProviders.includes(provider)) {
    return {
      isValid: false,
      errors: [`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}.`],
    };
  }

  return { isValid: true, errors: [] };
}

export function validateModel(model?: string): ValidationResult {
  if (!model) {
    return { isValid: false, errors: ['Model is required'] };
  }

  if (!/^[a-zA-Z0-9\-\.]+$/.test(model)) {
    return {
      isValid: false,
      errors: [
        `Invalid model name format: ${model}. Must contain only alphanumeric characters, dashes, and dots.`,
      ],
    };
  }

  return { isValid: true, errors: [] };
}

export function validateExecutionRequirements(config: CIAConfig): ValidationResult {
  const errors: string[] = [];

  const providerResult = validateProvider(config.provider);
  if (!providerResult.isValid) {
    errors.push(...providerResult.errors);
  }

  if (!config.model) {
    errors.push(
      'Model is required for execution. Use --model or set CIA_MODEL environment variable.'
    );
  } else {
    const modelResult = validateModel(config.model);
    if (!modelResult.isValid) {
      errors.push(...modelResult.errors);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate array of context sources
 * @param sources Array of context source parameters
 * @returns Validation result with any errors found
 */
export function validateContextSources(sources: string[]): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(sources)) {
    return { isValid: false, errors: ['Context sources must be an array'] };
  }

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const sourceErrors = validateSingleContextSource(source, i);
    errors.push(...sourceErrors);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single context source
 * @param source Context source parameter
 * @param index Index in the array (for error messages)
 * @returns Array of validation errors
 */
function validateSingleContextSource(source: string, index?: number): string[] {
  const errors: string[] = [];
  const prefix = index !== undefined ? `Context source #${index + 1}` : 'Context source';

  if (!source || typeof source !== 'string') {
    errors.push(`${prefix}: must be a non-empty string`);
    return errors;
  }

  const trimmed = source.trim();
  if (!trimmed) {
    errors.push(`${prefix}: cannot be empty or whitespace-only`);
    return errors;
  }

  // Resolve the context input to detect type
  try {
    const resolved = resolveContextInput(trimmed);

    switch (resolved.type) {
      case 'url':
        const urlErrors = validateContextUrl(trimmed);
        if (!urlErrors.isValid) {
          errors.push(...urlErrors.errors.map(err => `${prefix}: ${err}`));
        }
        break;

      case 'file':
        const fileErrors = validateContextFilePath(trimmed);
        if (!fileErrors.isValid) {
          errors.push(...fileErrors.errors.map(err => `${prefix}: ${err}`));
        }
        break;

      case 'folder':
        const folderErrors = validateContextFolderPath(trimmed);
        if (!folderErrors.isValid) {
          errors.push(...folderErrors.errors.map(err => `${prefix}: ${err}`));
        }
        break;

      case 'direct':
        // Direct content is always valid (JSON validation happens during processing)
        break;

      default:
        errors.push(`${prefix}: unrecognized context type for "${trimmed}"`);
    }
  } catch (error) {
    errors.push(
      `${prefix}: validation error - ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return errors;
}

/**
 * Validate file path for context usage
 * @param path File path to validate
 * @returns Validation result
 */
export function validateContextFilePath(path: string): ValidationResult {
  const errors: string[] = [];

  if (!path || typeof path !== 'string') {
    return { isValid: false, errors: ['File path must be a non-empty string'] };
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return { isValid: false, errors: ['File path cannot be empty'] };
  }

  // Security validation - prevent path traversal
  if (!isValidPath(trimmed)) {
    errors.push(
      'File path contains potentially dangerous patterns (path traversal, system directories)'
    );
  }

  // Check if file exists and is accessible
  if (!pathExists(trimmed)) {
    errors.push(`File does not exist or is not accessible: ${trimmed}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate folder path for context usage
 * @param path Folder path to validate
 * @returns Validation result
 */
export function validateContextFolderPath(path: string): ValidationResult {
  const errors: string[] = [];

  if (!path || typeof path !== 'string') {
    return { isValid: false, errors: ['Folder path must be a non-empty string'] };
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return { isValid: false, errors: ['Folder path cannot be empty'] };
  }

  // Security validation - prevent path traversal
  if (!isValidPath(trimmed)) {
    errors.push(
      'Folder path contains potentially dangerous patterns (path traversal, system directories)'
    );
  }

  // Check if folder exists and is accessible
  if (!pathExists(trimmed)) {
    errors.push(`Folder does not exist or is not accessible: ${trimmed}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate GitHub URL with SSRF protection
 * @param url URL to validate
 * @returns Validation result
 */
export function validateContextUrl(url: string): ValidationResult {
  const errors: string[] = [];

  if (!url || typeof url !== 'string') {
    return { isValid: false, errors: ['URL must be a non-empty string'] };
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return { isValid: false, errors: ['URL cannot be empty'] };
  }

  // Basic URL format validation
  try {
    new URL(trimmed);
  } catch (error) {
    errors.push(`Invalid URL format: ${trimmed}`);
    return { isValid: false, errors };
  }

  // SSRF protection - only allow HTTPS URLs
  if (!trimmed.startsWith('https://')) {
    errors.push('Only HTTPS URLs are allowed for security reasons');
  }

  // For GitHub URLs, use specific validation
  if (trimmed.includes('github.com')) {
    if (!validateGitHubUrl(trimmed)) {
      errors.push('Invalid GitHub URL format or contains security issues');
    }
  } else {
    // For non-GitHub URLs, apply additional SSRF protections
    const urlObj = new URL(trimmed);

    // Block private/local addresses
    const hostname = urlObj.hostname.toLowerCase();
    const dangerousHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      'metadata.goog', // Google Cloud metadata
      '169.254.169.254', // AWS metadata
    ];

    if (dangerousHosts.some(host => hostname === host || hostname.endsWith(host))) {
      errors.push('URL points to a private/local address which is not allowed');
    }

    // Block private IP ranges (basic check)
    if (
      hostname.match(/^192\.168\./i) ||
      hostname.match(/^10\./i) ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[01])\./i)
    ) {
      errors.push('URL points to a private IP address which is not allowed');
    }

    // For now, only allow GitHub URLs for full implementation
    errors.push('Only GitHub URLs are currently supported for context fetching');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate context sources in config
 * @param config CIA configuration
 * @returns Validation result
 */
export function validateConfigContextSources(config: CIAConfig): ValidationResult {
  const contextSources = config.context || [];

  if (contextSources.length === 0) {
    return { isValid: true, errors: [] };
  }

  return validateContextSources(contextSources);
}
