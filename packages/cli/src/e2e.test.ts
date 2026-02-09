import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

// Only run E2E tests when explicitly requested
const shouldRunE2ETests = process.env.RUN_E2E_TESTS === '1';

describe('End-to-End CLI Tests', () => {
  const testDir = '/tmp/cia-e2e-test';
  const testConfigDir = resolve(testDir, '.cia');
  const binaryPath = resolve(process.cwd(), '../../dist/cia');

  beforeAll(() => {
    if (!shouldRunE2ETests) {
      console.log('Skipping E2E tests. Set RUN_E2E_TESTS=1 to run them.');
      return;
    }

    // Set up test directory
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(testConfigDir, { recursive: true });
  });

  afterAll(() => {
    if (!shouldRunE2ETests) return;
    
    // Clean up test directory
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  const runCLI = (args: string[], options: { cwd?: string } = {}): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }> => {
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, {
        cwd: options.cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Set a timeout to prevent hanging tests
      setTimeout(() => {
        child.kill();
        reject(new Error('CLI command timed out'));
      }, 10000);
    });
  };

  describe('Binary Execution Tests', () => {
    it('should execute help command successfully', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['--help']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('CIA - Vendor-neutral AI agent CLI tool');
      expect(result.stdout).toContain('USAGE:');
      expect(result.stdout).toContain('COMMANDS:');
      expect(result.stdout).toContain('OPTIONS:');
    });

    it('should execute version command successfully', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['--version']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ciagent v');
      expect(result.stdout).toContain('Bun v');
      expect(result.stdout).toContain('Platform:');
    });

    it('should handle unknown commands gracefully', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['unknown-command']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command: unknown-command');
    });
  });

  describe('CLI Spec Compliance Tests', () => {
    it('should validate strict mode requirements', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['run', 'test', '--mode=strict']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Strict mode requires either --schema-file or --schema-inline');
    });

    it('should accept strict mode with schema', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI([
        'run', 'test', 
        '--mode=strict', 
        '--schema-inline={"type":"object"}',
        '--provider=azure',
        '--model=gpt-4'
      ]);
      
      // Should pass validation but fail at provider level (expected for Phase 1)
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('No provider configured');
    });

    it('should handle invalid argument values', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['run', 'test', '--mode=invalid']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid mode: invalid');
    });

    it('should validate timeout values', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['run', 'test', '--timeout=-5']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid timeout: -5');
    });
  });

  describe('Configuration Integration Tests', () => {
    it('should load configuration from file', async () => {
      if (!shouldRunE2ETests) return;

      // Create test config file
      const configFile = resolve(testConfigDir, 'config.json');
      writeFileSync(configFile, JSON.stringify({
        provider: 'azure',
        model: 'gpt-3.5-turbo',
        mode: 'lazy'
      }));

      const result = await runCLI(['run', 'test'], { cwd: testDir });
      
      // Should use config file and fail at provider level
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('No provider configured');

      unlinkSync(configFile);
    });

    it('should override config with CLI arguments', async () => {
      if (!shouldRunE2ETests) return;

      // Create test config with one provider
      const configFile = resolve(testConfigDir, 'config.json');
      writeFileSync(configFile, JSON.stringify({
        provider: 'azure',
        model: 'gpt-3.5-turbo'
      }));

      // Override provider via CLI
      const result = await runCLI([
        'run', 'test', 
        '--provider=openai',
        '--model=gpt-4'
      ], { cwd: testDir });
      
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('No provider configured');

      unlinkSync(configFile);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle missing required arguments', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI([]);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No command specified');
    });

    it('should validate execution requirements', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['run', 'test', '--provider=azure']);
      
      // Should fail because model is required
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('Model is required');
    });

    it('should provide helpful error messages', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['run', 'test', '--provider=invalid-provider']);
      
      expect(result.exitCode).toBe(3); // Provider validation is configuration error
      expect(result.stderr).toContain('Invalid provider: invalid-provider');
      expect(result.stderr).toContain('Must be one of: azure, openai, anthropic, google, local');
    });
  });

  describe('Global Installation Simulation', () => {
    it('should work when executed from different working directory', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI(['--version'], { cwd: '/tmp' });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ciagent v');
    });

    it('should respect working directory for relative config paths', async () => {
      if (!shouldRunE2ETests) return;

      // Create config in test directory
      const configFile = resolve(testDir, '.cia', 'config.json');
      writeFileSync(configFile, JSON.stringify({
        provider: 'azure',
        model: 'gpt-4'
      }));

      const result = await runCLI(['run', 'test'], { cwd: testDir });
      
      // Should find and use the config from the working directory
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('No provider configured');

      unlinkSync(configFile);
    });
  });

  // NOTE: Real Codex authentication tests would go here if RUN_E2E_TESTS=1 and ~/.codex/auth.json exists
  // But for Phase 1, we expect graceful failure with "No provider configured" 
  describe('Provider Integration Stubs', () => {
    it('should fail gracefully when no provider is configured (expected for Phase 1)', async () => {
      if (!shouldRunE2ETests) return;

      const result = await runCLI([
        'run', 'Hello world',
        '--provider=azure',
        '--model=gpt-4'
      ]);
      
      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('No provider configured');
      expect(result.stderr).toContain('Provider integrations will be available in Phase 2+');
    });
  });
});