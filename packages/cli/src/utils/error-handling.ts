import { ExitCode, EXIT_CODE_DESCRIPTIONS } from './exit-codes.js';

export interface CliError {
  code: ExitCode;
  message: string;
  details?: string;
  suggestion?: string;
}

/**
 * Creates a formatted error with exit code, message, and optional suggestion
 */
export function createError(
  code: ExitCode,
  message: string,
  details?: string,
  suggestion?: string
): CliError {
  return { code, message, details, suggestion };
}

/**
 * Formats and prints an error to stderr with consistent styling
 */
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

/**
 * Common error patterns for better user experience
 */
export const CommonErrors = {
  // Input validation errors
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
      'Available commands: run',
      'Try: cia run "your prompt here" --provider azure'
    ),

  unknownCommand: (command: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Unknown command: ${command}`,
      'Available commands: run',
      'Use --help to see all available options'
    ),

  // Configuration errors
  missingProvider: (): CliError =>
    createError(
      ExitCode.AUTH_CONFIG,
      'No provider configured',
      'Provider integrations are not yet implemented in Phase 1',
      'This error is expected - the CLI scaffold is working correctly'
    ),

  invalidConfig: (field: string, issue: string): CliError =>
    createError(
      ExitCode.INPUT_VALIDATION,
      `Configuration error: ${field}`,
      issue,
      'Check your config files: ~/.cia/config.json or .cia/config.json'
    ),

  // Schema validation errors
  schemaValidationFailed: (details: string): CliError =>
    createError(
      ExitCode.SCHEMA_VALIDATION,
      'Schema validation failed',
      details,
      'Check your --schema-file or --schema-inline parameter'
    ),

  // Execution errors
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
};

/**
 * Utility to handle unexpected errors with consistent formatting
 */
export function handleUnexpectedError(error: unknown): CliError {
  const message = error instanceof Error ? error.message : String(error);
  return createError(
    ExitCode.LLM_EXECUTION,
    'Unexpected error occurred',
    message,
    'Please report this issue if it persists'
  );
}

/**
 * Exit the process with proper error reporting
 */
export function exitWithError(error: CliError): never {
  printError(error);
  process.exit(error.code);
}