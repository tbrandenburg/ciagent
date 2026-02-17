import { describe, it, expect, beforeEach } from 'vitest';
import { InternalBashTool, BashToolArgs, BashResult } from '../../../src/providers/tools/bash.ts';

describe('InternalBashTool', () => {
  beforeEach(() => {
    // Reset any global state if needed
  });

  describe('execute', () => {
    it('should execute a simple echo command successfully', async () => {
      const args: BashToolArgs = {
        command: 'echo "Hello World"',
      };

      const result: BashResult = await InternalBashTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Hello World');
      expect(result.stderr).toBe('');
      expect(result.command).toBe('echo "Hello World"');
      expect(result.timestamp).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle commands with stderr output', async () => {
      const args: BashToolArgs = {
        command: 'echo "error message" >&2; echo "success message"',
      };

      const result: BashResult = await InternalBashTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('success message');
      expect(result.stderr).toBe('error message');
    });

    it('should handle failed commands gracefully', async () => {
      const args: BashToolArgs = {
        command: 'false', // Command that exits with code 1
      };

      const result: BashResult = await InternalBashTool.execute(args);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.command).toBe('false');
    });

    it('should respect custom timeout', async () => {
      const args: BashToolArgs = {
        command: 'sleep 2',
        timeout: 1000, // 1 second timeout
      };

      const result: BashResult = await InternalBashTool.execute(args);

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Command failed');
    });

    it('should validate command input', async () => {
      const invalidArgs: BashToolArgs = {
        command: '', // Empty command
      };

      await expect(InternalBashTool.execute(invalidArgs)).rejects.toThrow(
        'Command is required and must be a string'
      );
    });

    it('should reject potentially dangerous commands', async () => {
      const dangerousArgs: BashToolArgs = {
        command: 'rm -rf /',
      };

      await expect(InternalBashTool.execute(dangerousArgs)).rejects.toThrow(
        'Command contains potentially dangerous pattern'
      );
    });

    it('should work with custom working directory', async () => {
      const args: BashToolArgs = {
        command: 'pwd',
        workingDirectory: '/tmp',
      };

      const result: BashResult = await InternalBashTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('/tmp');
    });

    it('should handle long output correctly', async () => {
      const args: BashToolArgs = {
        command: 'for i in {1..100}; do echo "Line $i"; done',
      };

      const result: BashResult = await InternalBashTool.execute(args);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Line 1');
      expect(result.stdout).toContain('Line 100');
    });
  });

  describe('metadata', () => {
    it('should provide correct tool metadata', () => {
      const metadata = InternalBashTool.getMetadata();

      expect(metadata.name).toBe('bash');
      expect(metadata.description).toContain('Execute bash commands');
      expect(metadata.inputSchema).toBeDefined();
      expect(metadata.inputSchema.type).toBe('object');
      expect(metadata.inputSchema.required).toContain('command');
      expect(typeof metadata.execute).toBe('function');
    });

    it('should have valid JSON schema', () => {
      const { inputSchema } = InternalBashTool.metadata;

      expect(inputSchema.properties.command).toBeDefined();
      expect(inputSchema.properties.command.type).toBe('string');
      expect(inputSchema.properties.timeout).toBeDefined();
      expect(inputSchema.properties.timeout.type).toBe('number');
      expect(inputSchema.properties.workingDirectory).toBeDefined();
      expect(inputSchema.properties.workingDirectory.type).toBe('string');
    });
  });

  describe('security validation', () => {
    it('should reject fork bomb commands', async () => {
      const args: BashToolArgs = {
        command: ':(){ :|:& };:',
      };

      await expect(InternalBashTool.execute(args)).rejects.toThrow(
        'Command contains potentially dangerous pattern'
      );
    });

    it('should reject filesystem formatting commands', async () => {
      const args: BashToolArgs = {
        command: 'mkfs.ext4 /dev/sda1',
      };

      await expect(InternalBashTool.execute(args)).rejects.toThrow(
        'Command contains potentially dangerous pattern'
      );
    });

    it('should reject disk writing commands', async () => {
      const args: BashToolArgs = {
        command: 'dd if=/dev/zero of=/dev/sda',
      };

      await expect(InternalBashTool.execute(args)).rejects.toThrow(
        'Command contains potentially dangerous pattern'
      );
    });

    it('should reject commands that are too long', async () => {
      const longCommand = 'echo ' + 'a'.repeat(10001);
      const args: BashToolArgs = {
        command: longCommand,
      };

      await expect(InternalBashTool.execute(args)).rejects.toThrow('Command too long');
    });
  });
});
