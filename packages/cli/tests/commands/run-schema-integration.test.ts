import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/commands/run.js';
import { CIAConfig } from '../../src/shared/config/loader.js';
import { ExitCode } from '../../src/utils/exit-codes.js';
import * as providers from '../../src/providers/index.js';

// Mock console methods to capture output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('Run Command - Schema Validation Error Handling', () => {
  const mockConsoleLog = vi.fn();
  const mockConsoleError = vi.fn();

  beforeEach(() => {
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  it('should return SCHEMA_VALIDATION exit code when schema validation fails', async () => {
    // Mock the provider factory to return a provider that throws schema validation errors
    const mockProvider = {
      async *sendQuery() {
        throw new Error('Schema validation failed after 3 retries: JSON Parse Error');
      },
      getType: () => 'mock-provider',
    };

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockProvider);

    const config: CIAConfig = {
      provider: 'codex',
      mode: 'strict',
      'schema-inline':
        '{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}',
    };

    const exitCode = await runCommand(['Generate JSON'], config);

    // Should return the schema validation exit code
    expect(exitCode).toBe(ExitCode.SCHEMA_VALIDATION);

    // Should print schema validation error
    expect(mockConsoleError).toHaveBeenCalled();
    const errorOutput = mockConsoleError.mock.calls.map(call => call.join(' ')).join(' ');
    expect(errorOutput).toMatch(/Schema validation failed/i);
  });

  it('should return SCHEMA_VALIDATION exit code for generic schema validation errors', async () => {
    // Mock the provider factory to return a provider that throws schema validation errors
    const mockProvider = {
      async *sendQuery() {
        throw new Error('schema validation error: invalid format');
      },
      getType: () => 'mock-provider',
    };

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockProvider);

    const config: CIAConfig = {
      provider: 'codex',
    };

    const exitCode = await runCommand(['Generate something'], config);

    // Should return the schema validation exit code
    expect(exitCode).toBe(ExitCode.SCHEMA_VALIDATION);
  });

  it('should return EXECUTION_FAILED exit code for non-schema errors', async () => {
    // Mock the provider factory to return a provider that throws non-schema errors
    const mockProvider = {
      async *sendQuery() {
        throw new Error('Network connection failed');
      },
      getType: () => 'mock-provider',
    };

    vi.spyOn(providers, 'createAssistantChat').mockResolvedValue(mockProvider);

    const config: CIAConfig = {
      provider: 'codex',
    };

    const exitCode = await runCommand(['Generate something'], config);

    // Should return execution failed exit code, not schema validation
    expect(exitCode).toBe(ExitCode.LLM_EXECUTION);
    expect(exitCode).not.toBe(ExitCode.SCHEMA_VALIDATION);
  });
});
