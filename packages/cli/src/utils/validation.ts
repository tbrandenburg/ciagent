import { existsSync } from 'fs';
import { CIAConfig } from '../config/loader.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate CLI arguments and configuration per CLI spec
 */
export function validateConfig(config: CIAConfig): ValidationResult {
  const errors: string[] = [];
  
  // Validate mode
  if (config.mode && !['lazy', 'strict'].includes(config.mode)) {
    errors.push(`Invalid mode: ${config.mode}. Must be 'lazy' or 'strict'.`);
  }
  
  // Validate format
  if (config.format && !['default', 'json'].includes(config.format)) {
    errors.push(`Invalid format: ${config.format}. Must be 'default' or 'json'.`);
  }
  
  // Validate output format
  if (config['output-format'] && !['json', 'yaml', 'md', 'text'].includes(config['output-format'])) {
    errors.push(`Invalid output-format: ${config['output-format']}. Must be 'json', 'yaml', 'md', or 'text'.`);
  }
  
  // Validate log level
  if (config['log-level']) {
    const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (!validLogLevels.includes(config['log-level'])) {
      errors.push(`Invalid log-level: ${config['log-level']}. Must be one of: ${validLogLevels.join(', ')}.`);
    }
  }
  
  // Strict mode validation - requires schema
  if (config.mode === 'strict') {
    if (!config['schema-file'] && !config['schema-inline']) {
      errors.push('Strict mode requires either --schema-file or --schema-inline to be specified.');
    }
  }
  
  // Validate schema file exists if specified
  if (config['schema-file']) {
    if (!existsSync(config['schema-file'])) {
      errors.push(`Schema file not found: ${config['schema-file']}`);
    } else if (!config['schema-file'].endsWith('.json')) {
      errors.push(`Schema file must be a JSON file: ${config['schema-file']}`);
    }
  }
  
  // Validate input file exists if specified
  if (config['input-file']) {
    if (!existsSync(config['input-file'])) {
      errors.push(`Input file not found: ${config['input-file']}`);
    }
  }
  
  // Validate schema-inline is valid JSON if specified
  if (config['schema-inline']) {
    try {
      JSON.parse(config['schema-inline']);
    } catch (error) {
      errors.push('Invalid JSON in --schema-inline option.');
    }
  }
  
  // Validate numeric values
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
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate provider name
 */
export function validateProvider(provider?: string): ValidationResult {
  if (!provider) {
    return { isValid: false, errors: ['Provider is required'] };
  }
  
  const validProviders = ['azure', 'openai', 'anthropic', 'google', 'local'];
  if (!validProviders.includes(provider)) {
    return {
      isValid: false,
      errors: [`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}.`]
    };
  }
  
  return { isValid: true, errors: [] };
}

/**
 * Validate model name format (basic validation)
 */
export function validateModel(model?: string): ValidationResult {
  if (!model) {
    return { isValid: false, errors: ['Model is required'] };
  }
  
  // Basic validation - model names should be alphanumeric with dashes/dots
  if (!/^[a-zA-Z0-9\-\.]+$/.test(model)) {
    return {
      isValid: false,
      errors: [`Invalid model name format: ${model}. Must contain only alphanumeric characters, dashes, and dots.`]
    };
  }
  
  return { isValid: true, errors: [] };
}

/**
 * Validate that required fields for execution are present
 */
export function validateExecutionRequirements(config: CIAConfig): ValidationResult {
  const errors: string[] = [];
  
  // Provider and model are required for actual execution
  const providerResult = validateProvider(config.provider);
  if (!providerResult.isValid) {
    errors.push(...providerResult.errors);
  }
  
  if (!config.model) {
    errors.push('Model is required for execution. Use --model or set CIA_MODEL environment variable.');
  } else {
    const modelResult = validateModel(config.model);
    if (!modelResult.isValid) {
      errors.push(...modelResult.errors);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}