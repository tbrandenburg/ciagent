import { existsSync, readFileSync } from 'fs';
import { CIAConfig } from '../config/loader.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateConfig(config: CIAConfig): ValidationResult {
  const errors: string[] = [];
  // Extensible provider list - matches the VERCEL_PROVIDERS + existing providers
  const validProviders = ['azure', 'codex', 'claude'];

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

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateProvider(provider?: string): ValidationResult {
  // Extensible provider list - matches the VERCEL_PROVIDERS + existing providers
  const validProviders = ['azure', 'codex', 'claude'];

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
