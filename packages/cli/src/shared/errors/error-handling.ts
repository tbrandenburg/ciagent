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
};

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
