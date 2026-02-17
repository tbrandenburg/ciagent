import { ExitCode, EXIT_CODE_DESCRIPTIONS } from '../../utils/exit-codes.js';

export interface CliError {
  code: ExitCode;
  message: string;
  details?: string;
  suggestion?: string;
}

export function createError(
  code: ExitCode,
  message: string,
  details?: string,
  suggestion?: string
): CliError {
  return { code, message, details, suggestion };
}

export function printError(error: CliError): void {
  console.error(`\n❌ Error: ${error.message}`);

  if (error.details) {
    console.error(`   ${error.details}`);
  }

  if (error.suggestion) {
    console.error(`💡 Suggestion: ${error.suggestion}`);
  }

  if (error.code !== ExitCode.SUCCESS) {
    console.error(`   Exit code: ${error.code} (${EXIT_CODE_DESCRIPTIONS[error.code]})`);
  }
  console.error('');
}

export const CommonErrors = {
  invalidArgument: (arg: string, expected: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Invalid argument: ${arg}`,
      `Expected: ${expected}`,
      'Check your command syntax with --help'
    ),

  missingCommand: (): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      'No command specified',
      'Available commands: run, models',
      'Try: cia run "your prompt here"'
    ),

  unknownCommand: (command: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Unknown command: ${command}`,
      'Available commands: run, models',
      'Use --help to see all available options'
    ),

  missingProvider: (): CliError =>
    createError(
      ExitCode.AUTH_CONFIG,
      'Provider is required',
      'Only provider=codex is supported',
      'Set --provider=codex or CIA_PROVIDER=codex'
    ),

  authConfig: (details: string): CliError =>
    createError(
      ExitCode.AUTH_CONFIG,
      'Authentication/configuration error',
      details,
      'Configure Codex auth at ~/.codex/auth.json and retry'
    ),

  invalidConfig: (field: string, issue: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Configuration error: ${field}`,
      issue,
      'Check your config files: ~/.cia/config.json or .cia/config.json'
    ),

  schemaValidationFailed: (details: string): CliError =>
    createError(
      ExitCode.SCHEMA_VALIDATION,
      'Schema validation failed',
      details,
      'Check your --schema-file or --schema-inline parameter'
    ),

  executionFailed: (reason: string): CliError =>
    createError(
      ExitCode.LLM_EXECUTION,
      'AI execution failed',
      reason,
      'Try again with different parameters or check your configuration'
    ),

  timeout: (duration: number): CliError =>
    createError(
      ExitCode.TIMEOUT,
      `Operation timed out after ${duration}s`,
      'The AI provider took too long to respond',
      'Try increasing --timeout or check your network connection'
    ),

  retryExhausted: (attempts: number, lastError: string): CliError =>
    createError(
      ExitCode.LLM_EXECUTION,
      `Provider failed after ${attempts} retry attempts`,
      lastError,
      'Check your network connection and provider configuration'
    ),

  contractViolation: (details: string): CliError =>
    createError(
      ExitCode.LLM_EXECUTION,
      'Provider contract violation detected',
      details,
      'This indicates a provider implementation issue - report to maintainers'
    ),

  providerUnreliable: (provider: string, reason: string): CliError =>
    createError(
      ExitCode.LLM_EXECUTION,
      `Provider '${provider}' reliability issue`,
      reason,
      'Try switching providers or check provider service status'
    ),

  // Context-related errors
  contextSourceNotFound: (source: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Context source not found: ${source}`,
      'The specified file, folder, or URL could not be accessed',
      'Check that the path exists and you have permission to read it'
    ),

  contextFormatInvalid: (source: string, expectedFormat: string, actualFormat: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Invalid format for context source: ${source}`,
      `Expected ${expectedFormat}, got ${actualFormat}`,
      'Check the file format or try specifying the format explicitly'
    ),

  contextProcessingFailed: (source: string, reason: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Context processing failed: ${source}`,
      reason,
      'Check that the context source is accessible and in a supported format'
    ),

  githubApiError: (url: string, statusCode?: number, message?: string): CliError =>
    createError(
      ExitCode.LLM_EXECUTION,
      `GitHub API error for ${url}`,
      statusCode ? `HTTP ${statusCode}: ${message || 'Unknown error'}` : message || 'Unknown error',
      'Check your GitHub token (GITHUB_TOKEN env var) and ensure the URL is valid'
    ),

  contextUrlInvalid: (url: string, reason?: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Invalid context URL: ${url}`,
      reason || 'URL format is not supported or contains security issues',
      'Use valid GitHub URLs (https://github.com/org/repo/pull/123 or issues/123)'
    ),
};

// Hierarchical context error system inspired by AI toolkit exception design
export class ContextError extends Error {
  constructor(
    message: string,
    public readonly source?: string
  ) {
    super(message);
    this.name = 'ContextError';
  }
}

export class ContextFormatError extends ContextError {
  constructor(source: string, expectedFormat: string, actualFormat: string) {
    super(
      `Invalid format for context source "${source}": expected ${expectedFormat}, got ${actualFormat}`
    );
    this.name = 'ContextFormatError';
  }
}

export class ContextSourceError extends ContextError {
  constructor(source: string, reason: string) {
    super(`Cannot access context source "${source}": ${reason}`);
    this.name = 'ContextSourceError';
  }
}

export class ContextProcessingError extends ContextError {
  constructor(source: string, operation: string, reason: string) {
    super(`Context processing failed for "${source}" during ${operation}: ${reason}`);
    this.name = 'ContextProcessingError';
  }
}

export class GitHubApiError extends ContextError {
  constructor(
    url: string,
    public readonly statusCode?: number,
    public readonly apiMessage?: string
  ) {
    const message = statusCode
      ? `GitHub API error ${statusCode} for ${url}: ${apiMessage || 'Unknown error'}`
      : `GitHub API error for ${url}: ${apiMessage || 'Unknown error'}`;
    super(message, url);
    this.name = 'GitHubApiError';
  }
}

/**
 * Convert context-specific errors to CLI errors with appropriate exit codes and suggestions
 */
export function convertContextErrorToCliError(error: Error): CliError {
  if (error instanceof ContextSourceError) {
    return CommonErrors.contextSourceNotFound(error.source || 'unknown');
  } else if (error instanceof ContextFormatError) {
    // Extract format info from error message
    const match = error.message.match(/expected (\w+), got (\w+)/);
    const expected = match?.[1] || 'valid format';
    const actual = match?.[2] || 'unknown format';
    return CommonErrors.contextFormatInvalid(error.source || 'unknown', expected, actual);
  } else if (error instanceof ContextProcessingError) {
    return CommonErrors.contextProcessingFailed(error.source || 'unknown', error.message);
  } else if (error instanceof GitHubApiError) {
    return CommonErrors.githubApiError(
      error.source || 'unknown',
      error.statusCode,
      error.apiMessage
    );
  } else if (error instanceof ContextError) {
    return CommonErrors.contextProcessingFailed(error.source || 'unknown', error.message);
  }

  // Fall back to generic error handling
  return handleUnexpectedError(error);
}

export function handleUnexpectedError(error: unknown): CliError {
  const message = error instanceof Error ? error.message : String(error);
  return createError(
    ExitCode.LLM_EXECUTION,
    'Unexpected error occurred',
    message,
    'Please report this issue if it persists'
  );
}

export function exitWithError(error: CliError): void {
  printError(error);
  process.exit(error.code);
}
