import { describe, it, expect, jest, beforeEach, afterEach } from 'bun:test';
import { ExitCode } from './exit-codes';
import {
  createError,
  printError,
  CommonErrors,
  handleUnexpectedError,
  type CliError,
} from './error-handling';

describe('Error Handling', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('createError', () => {
    it('creates basic error with code and message', () => {
      const error = createError(ExitCode.INPUT_VALIDATION, 'Test message');
      
      expect(error).toEqual({
        code: ExitCode.INPUT_VALIDATION,
        message: 'Test message',
      });
    });

    it('creates error with all fields', () => {
      const error = createError(
        ExitCode.AUTH_CONFIG,
        'Test message',
        'Test details',
        'Test suggestion'
      );
      
      expect(error).toEqual({
        code: ExitCode.AUTH_CONFIG,
        message: 'Test message',
        details: 'Test details',
        suggestion: 'Test suggestion',
      });
    });
  });

  describe('printError', () => {
    it('prints minimal error', () => {
      const error: CliError = {
        code: ExitCode.INPUT_VALIDATION,
        message: 'Test error',
      };
      
      printError(error);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('\n❌ Error: Test error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '   Exit code: 1 (Invalid command line arguments or options)'
      );
    });

    it('prints full error with details and suggestion', () => {
      const error: CliError = {
        code: ExitCode.SCHEMA_VALIDATION,
        message: 'Schema failed',
        details: 'Missing required field',
        suggestion: 'Add the field to your schema',
      };
      
      printError(error);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('\n❌ Error: Schema failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('   Missing required field');
      expect(consoleErrorSpy).toHaveBeenCalledWith('💡 Suggestion: Add the field to your schema');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '   Exit code: 2 (Schema validation failed)'
      );
    });
  });

  describe('CommonErrors', () => {
    it('creates invalidArgument error', () => {
      const error = CommonErrors.invalidArgument('--invalid', 'string value');
      
      expect(error.code).toBe(ExitCode.INPUT_VALIDATION);
      expect(error.message).toBe('Invalid argument: --invalid');
      expect(error.details).toBe('Expected: string value');
      expect(error.suggestion).toBe('Check your command syntax with --help');
    });

    it('creates missingCommand error', () => {
      const error = CommonErrors.missingCommand();
      
      expect(error.code).toBe(ExitCode.INPUT_VALIDATION);
      expect(error.message).toBe('No command specified');
      expect(error.suggestion).toBe('Try: cia run \"your prompt here\" --provider azure');
    });

    it('creates timeout error', () => {
      const error = CommonErrors.timeout(30);
      
      expect(error.code).toBe(ExitCode.TIMEOUT);
      expect(error.message).toBe('Operation timed out after 30s');
    });
  });

  describe('handleUnexpectedError', () => {
    it('handles Error objects', () => {
      const originalError = new Error('Something went wrong');
      const cliError = handleUnexpectedError(originalError);
      
      expect(cliError.code).toBe(ExitCode.LLM_EXECUTION);
      expect(cliError.message).toBe('Unexpected error occurred');
      expect(cliError.details).toBe('Something went wrong');
    });

    it('handles non-Error values', () => {
      const cliError = handleUnexpectedError('String error');
      
      expect(cliError.code).toBe(ExitCode.LLM_EXECUTION);
      expect(cliError.details).toBe('String error');
    });
  });
});