import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { main } from './cli.js';

describe('CLI Main Function', () => {
  let consoleSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Help and Version Commands', () => {
    it('should display help when --help is provided', async () => {
      const exitCode = await main(['--help']);
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('CIA - Vendor-neutral AI agent CLI tool for CI/CD pipelines');
    });

    it('should display help when -h is provided', async () => {
      const exitCode = await main(['-h']);
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('CIA - Vendor-neutral AI agent CLI tool for CI/CD pipelines');
    });

    it('should display version when --version is provided', async () => {
      const exitCode = await main(['--version']);
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ciagent v'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Bun v'));
    });

    it('should display version when -v is provided', async () => {
      const exitCode = await main(['-v']);
      expect(exitCode).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ciagent v'));
    });
  });

  describe('Argument Parsing', () => {
    it('should return error code 1 for invalid arguments', async () => {
      const exitCode = await main(['--invalid-arg']);
      expect(exitCode).toBe(1);
    });

    it('should return error code 1 when no command is specified', async () => {
      const exitCode = await main([]);
      expect(exitCode).toBe(1);
    });

    it('should return error code 1 for unknown command', async () => {
      const exitCode = await main(['unknown-command']);
      expect(exitCode).toBe(1);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate strict mode requires schema', async () => {
      const exitCode = await main(['run', 'test', '--mode=strict']);
      expect(exitCode).toBe(1); // INPUT_VALIDATION error
    });

    it('should validate invalid mode values', async () => {
      const exitCode = await main(['run', 'test', '--mode=invalid']);
      expect(exitCode).toBe(1);
    });

    it('should validate invalid format values', async () => {
      const exitCode = await main(['run', 'test', '--format=invalid']);
      expect(exitCode).toBe(1);
    });
  });

  describe('Run Command', () => {
    it('should fail gracefully with no provider configured', async () => {
      const exitCode = await main(['run', 'test prompt', '--model=gpt-4']);
      expect(exitCode).toBe(3); // AUTH_CONFIG error - expected for Phase 1
    });

    it('should validate execution requirements', async () => {
      const exitCode = await main(['run', 'test prompt']); 
      expect(exitCode).toBe(3); // Should fail with missing model
    });
  });

  describe('Default Values', () => {
    it('should use default provider azure', async () => {
      const exitCode = await main(['run', 'test', '--model=gpt-4']);
      expect(exitCode).toBe(3); // Expected failure with provider configured message
    });

    it('should use default mode lazy', async () => {
      // Lazy mode should not require schema
      const exitCode = await main(['run', 'test', '--model=gpt-4']);
      expect(exitCode).toBe(3); // Should get to provider error, not validation error
    });
  });
});