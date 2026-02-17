/**
 * Internal Bash Tool for CIA Agent
 * Provides secure bash command execution with timeout and error handling
 * Serves as baseline for MCP bash tool comparison
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BashToolArgs {
  command: string;
  timeout?: number;
  workingDirectory?: string;
}

export interface BashResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  timestamp: string;
  executionTime: number;
}

export class InternalBashTool {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_BUFFER = 1024 * 1024; // 1MB

  static readonly metadata = {
    name: 'bash',
    description: 'Execute bash commands safely with timeout and error handling',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
          minimum: 1000,
          maximum: 300000, // 5 minutes max
        },
        workingDirectory: {
          type: 'string',
          description: 'Working directory for command execution',
        },
      },
      required: ['command'],
    },
  };

  /**
   * Execute a bash command with safety controls
   */
  static async execute(args: BashToolArgs): Promise<BashResult> {
    const startTime = Date.now();
    const { command, timeout = this.DEFAULT_TIMEOUT, workingDirectory } = args;

    // Validate input
    if (!command || typeof command !== 'string') {
      throw new Error('Command is required and must be a string');
    }

    if (command.trim().length === 0) {
      throw new Error('Command cannot be empty');
    }

    // Security: Basic command validation (can be extended)
    this.validateCommand(command);

    try {
      console.log(`[Internal Bash] Executing: ${command}`);

      const execOptions: any = {
        timeout,
        maxBuffer: this.MAX_BUFFER,
        shell: '/bin/bash',
      };

      if (workingDirectory) {
        execOptions.cwd = workingDirectory;
      }

      const { stdout, stderr } = await execAsync(command, execOptions);
      const executionTime = Date.now() - startTime;

      const result: BashResult = {
        command,
        stdout: stdout ? stdout.toString().trim() : '',
        stderr: stderr ? stderr.toString().trim() : '',
        exitCode: 0,
        success: true,
        timestamp: new Date().toISOString(),
        executionTime,
      };

      console.log(`[Internal Bash] Success (${executionTime}ms)`);
      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      const result: BashResult = {
        command,
        stdout: error.stdout ? error.stdout.toString().trim() : '',
        stderr: error.stderr ? error.stderr.toString().trim() : error.message,
        exitCode: error.code || 1,
        success: false,
        timestamp: new Date().toISOString(),
        executionTime,
      };

      console.log(`[Internal Bash] Failed (${executionTime}ms): ${error.message}`);
      return result; // Return error as result rather than throwing
    }
  }

  /**
   * Basic command validation for security
   */
  private static validateCommand(command: string): void {
    // List of potentially dangerous patterns (can be extended)
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // rm -rf /
      /:\(\)\{\s*:\|\:&\s*\};:/, // fork bomb
      /mkfs/, // filesystem formatting
      /dd\s+if=.*of=\/dev/, // disk writing
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Command contains potentially dangerous pattern: ${pattern.source}`);
      }
    }

    // Length validation
    if (command.length > 10000) {
      throw new Error('Command too long (max 10000 characters)');
    }
  }

  /**
   * Get tool metadata for provider registration
   */
  static getMetadata() {
    return {
      ...this.metadata,
      execute: this.execute.bind(this),
    };
  }
}
