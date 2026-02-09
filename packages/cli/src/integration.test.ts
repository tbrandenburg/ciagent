import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { main } from './cli.js';
import { loadConfig } from './config/loader.js';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

describe('CLI Integration Tests', () => {
  const testConfigDir = '/tmp/cia-integration-test/.cia';
  const testConfigFile = resolve(testConfigDir, 'config.json');
  const testEnvFile = resolve(testConfigDir, '.env');
  let processExitSpy: any;

  beforeEach(() => {
    // Set up test environment
    if (existsSync(testConfigFile)) unlinkSync(testConfigFile);
    if (existsSync(testEnvFile)) unlinkSync(testEnvFile);
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
    
    // Mock process.exit to prevent tests from actually exiting
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(testConfigFile)) unlinkSync(testConfigFile);
    if (existsSync(testEnvFile)) unlinkSync(testEnvFile);
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
    
    // Restore process.exit
    processExitSpy?.mockRestore();
  });

  describe('Config Loading + CLI Parsing Integration', () => {
    it('should integrate configuration hierarchy with CLI parsing', async () => {
      // Set up config file
      mkdirSync(testConfigDir, { recursive: true });
      writeFileSync(testConfigFile, JSON.stringify({
        provider: 'azure',
        model: 'gpt-3.5-turbo',
        'log-level': 'INFO'
      }));

      // Temporarily override HOME to point to test directory
      const originalHome = process.env.HOME;
      process.env.HOME = '/tmp/cia-integration-test';

      try {
        // Test that CLI args override config file
        const exitCode = await main(['run', 'test prompt', '--provider=openai', '--model=gpt-4']);
        
        // Should fail with provider error but validate config correctly
        expect(exitCode).toBe(3); // AUTH_CONFIG - expected for Phase 1
      } finally {
        // Restore environment
        if (originalHome) process.env.HOME = originalHome;
      }
    });

    it('should validate strict mode with schema requirements across components', async () => {
      // Test that strict mode validation works through full CLI pipeline
      const exitCode = await main(['run', 'test', '--mode=strict', '--provider=azure', '--model=gpt-4']);
      
      // Should fail with validation error (no schema provided)
      expect(exitCode).toBe(1); // INPUT_VALIDATION
    });

    it('should validate format combinations work end-to-end', async () => {
      const exitCode = await main([
        'run', 'test', 
        '--mode=lazy', 
        '--format=json', 
        '--output-format=yaml',
        '--provider=azure',
        '--model=gpt-4'
      ]);

      // Should get to provider error (config and validation passed)
      expect(exitCode).toBe(3); // AUTH_CONFIG
    });
  });

  describe('Error Propagation Integration', () => {
    it('should propagate validation errors correctly through the stack', async () => {
      // Test that validation errors bubble up correctly
      const exitCode = await main(['run', 'test', '--timeout=-5']);
      
      expect(exitCode).toBe(1); // INPUT_VALIDATION
    });

    it('should handle configuration loading errors', async () => {
      // Set up malformed config
      mkdirSync(testConfigDir, { recursive: true });
      writeFileSync(testConfigFile, '{ invalid json }');

      const originalHome = process.env.HOME;
      process.env.HOME = '/tmp/cia-integration-test';

      try {
        // Should handle config loading error - process.exit will be called
        let exitCalled = false;
        try {
          await main(['run', 'test']);
        } catch (error: any) {
          if (error.message === 'process.exit called') {
            exitCalled = true;
          }
        }
        // Verify that process.exit was called due to malformed config
        expect(exitCalled).toBe(true);
      } finally {
        if (originalHome) process.env.HOME = originalHome;
      }
    });
  });

  describe('Mode and Format Combination Scenarios', () => {
    it('should handle lazy mode with all format combinations', async () => {
      const formatCombinations = [
        ['--format=default', '--output-format=json'],
        ['--format=json', '--output-format=yaml'],
        ['--format=default', '--output-format=md']
      ];

      for (const formats of formatCombinations) {
        const exitCode = await main([
          'run', 'test prompt',
          '--mode=lazy',
          '--provider=azure',
          '--model=gpt-4',
          ...formats
        ]);

        // All should get to provider error (validation passed)
        expect(exitCode).toBe(3); // AUTH_CONFIG
      }
    });

    it('should handle strict mode with valid schema', async () => {
      const exitCode = await main([
        'run', 'test',
        '--mode=strict',
        '--schema-inline={"type":"object"}',
        '--provider=azure',
        '--model=gpt-4'
      ]);

      // Should pass validation and get to provider error
      expect(exitCode).toBe(3); // AUTH_CONFIG
    });
  });

  describe('Component Integration', () => {
    it('should integrate help command with main CLI', async () => {
      const exitCode = await main(['--help']);
      expect(exitCode).toBe(0);
    });

    it('should integrate version command with main CLI', async () => {
      const exitCode = await main(['--version']);
      expect(exitCode).toBe(0);
    });

    it('should integrate configuration loading with validation', () => {
      // Test direct integration between config loader and validation
      const config = loadConfig({
        provider: 'azure',
        model: 'gpt-4',
        mode: 'lazy',
        format: 'json'
      });

      expect(config.provider).toBe('azure');
      expect(config.model).toBe('gpt-4');
      expect(config.mode).toBe('lazy');
      expect(config.format).toBe('json');
    });
  });

  describe('Cross-Module Workflow Validation', () => {
    it('should validate complete run workflow without provider', async () => {
      // Test the complete flow from argument parsing to execution attempt
      const exitCode = await main([
        'run', 'test prompt',
        '--provider=azure',
        '--model=gpt-4',
        '--mode=lazy',
        '--format=json',
        '--output-file=test.json',
        '--retries=3',
        '--timeout=30'
      ]);

      // Should pass all validation and fail at provider stage
      expect(exitCode).toBe(3); // AUTH_CONFIG - expected "No provider configured" error
    });

    it('should validate context parameter handling', async () => {
      const exitCode = await main([
        'run', 'test',
        '--context=file1.txt',
        '--context=file2.txt',
        '--provider=azure',
        '--model=gpt-4'
      ]);

      // Should handle multiple context parameters correctly
      expect(exitCode).toBe(3); // AUTH_CONFIG
    });
  });
});