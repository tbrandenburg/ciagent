/**
 * CLI exit codes as specified in the CLI specification
 */
export const enum ExitCode {
  SUCCESS = 0,
  INPUT_VALIDATION = 1,
  SCHEMA_VALIDATION = 2,
  AUTH_CONFIG = 3,
  LLM_EXECUTION = 4,
  TIMEOUT = 5,
}

/**
 * Exit code descriptions for error reporting
 */
export const EXIT_CODE_DESCRIPTIONS: Record<ExitCode, string> = {
  [ExitCode.SUCCESS]: 'Command completed successfully',
  [ExitCode.INPUT_VALIDATION]: 'Invalid command line arguments or options',
  [ExitCode.SCHEMA_VALIDATION]: 'Schema validation failed',
  [ExitCode.AUTH_CONFIG]: 'Authentication or configuration error',
  [ExitCode.LLM_EXECUTION]: 'LLM execution failed',
  [ExitCode.TIMEOUT]: 'Operation timed out',
};
