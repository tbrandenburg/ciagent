import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printHelpText } from '../../src/commands/help.js';

describe('Help Command', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should print help text with all sections', () => {
    printHelpText();

    // Check that main sections are present
    expect(consoleSpy).toHaveBeenCalledWith(
      'CIA - Vendor-neutral AI agent CLI tool for CI/CD pipelines'
    );
    expect(consoleSpy).toHaveBeenCalledWith('USAGE:');
    expect(consoleSpy).toHaveBeenCalledWith('COMMANDS:');
    expect(consoleSpy).toHaveBeenCalledWith('OPTIONS:');
    expect(consoleSpy).toHaveBeenCalledWith('EXAMPLES:');
    expect(consoleSpy).toHaveBeenCalledWith('EXIT CODES:');
  });

  it('should include all CLI spec options', () => {
    printHelpText();

    // Check key CLI spec options are documented
    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('--provider');
    expect(allOutput).toContain('--model');
    expect(allOutput).toContain('--mode');
    expect(allOutput).toContain('--format');
    expect(allOutput).toContain('--schema-file');
    expect(allOutput).toContain('--schema-inline');
    expect(allOutput).toContain('--retries');
    expect(allOutput).toContain('--timeout');
  });

  it('should include provider options', () => {
    printHelpText();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('AI provider (azure|openai|codex|claude) [default: codex]');
  });

  it('should include mode options', () => {
    printHelpText();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('lazy|strict');
  });

  it('should include practical examples', () => {
    printHelpText();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('cia run "Explain how CI/CD works"');
    expect(allOutput).toContain('--schema-file user.schema.json');
    expect(allOutput).toContain('--context docs/api.md');
  });

  it('should document explicit configuration precedence without legacy env defaults', () => {
    printHelpText();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('1. User config: ~/.cia/config.json');
    expect(allOutput).toContain('2. Repository config: .cia/config.json');
    expect(allOutput).toContain('3. Command line arguments');
    expect(allOutput).not.toContain('CIA_PROVIDER');
    expect(allOutput).not.toContain('CIA_MODEL');
  });

  it('should document exit codes', () => {
    printHelpText();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('0  Success');
    expect(allOutput).toContain('1  Input validation error');
    expect(allOutput).toContain('3  Authentication/configuration error');
  });
});
