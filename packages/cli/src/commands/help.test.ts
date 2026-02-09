import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { printHelpText } from './help.js';

describe('Help Command', () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should print help text with all sections', () => {
    printHelpText();
    
    // Check that main sections are present
    expect(consoleSpy).toHaveBeenCalledWith('CIA - Vendor-neutral AI agent CLI tool for CI/CD pipelines');
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
    expect(allOutput).toContain('azure|openai|anthropic|google|local');
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

  it('should document exit codes', () => {
    printHelpText();
    
    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('0  Success');
    expect(allOutput).toContain('1  Input validation error');
    expect(allOutput).toContain('3  Authentication/configuration error');
  });
});