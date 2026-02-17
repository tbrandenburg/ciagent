import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExitCode } from '../../src/utils/exit-codes.js';
import type { CIAConfig } from '../../src/shared/config/loader.js';

// Mock the MCP provider module
const mockMCPProvider = {
  initialize: vi.fn(),
  getHealthInfo: vi.fn(),
  getTools: vi.fn(),
};

vi.mock('../../src/providers/mcp.js', () => ({
  mcpProvider: mockMCPProvider,
}));

// Import after mocking
const { mcpCommand } = await import('../../src/commands/mcp.js');

// Mock console.log to capture output
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('MCP Commands - Basic Tests', () => {
  const mockConfig: CIAConfig = {
    provider: 'codex',
    mode: 'lazy',
    format: 'default',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockMCPProvider.initialize.mockResolvedValue(undefined);
    mockMCPProvider.getHealthInfo.mockReturnValue({
      healthy: false,
      serverCount: 0,
      connectedServers: 0,
      toolCount: 0,
      servers: [],
    });
    mockMCPProvider.getTools.mockReturnValue([]);
  });

  it('should show usage when no subcommand provided', async () => {
    const result = await mcpCommand([], mockConfig);

    expect(result).toBe(ExitCode.SUCCESS);
    expect(mockConsoleLog).toHaveBeenCalledWith('Usage: cia mcp <command> [options]');
  });

  it('should handle unknown subcommands', async () => {
    const result = await mcpCommand(['unknown'], mockConfig);

    expect(result).toBe(ExitCode.INPUT_VALIDATION);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Unknown command: mcp unknown')
    );
  });

  it('should initialize MCP provider and run status command', async () => {
    const result = await mcpCommand(['status'], mockConfig);

    expect(mockMCPProvider.initialize).toHaveBeenCalledWith(mockConfig);
    expect(result).toBe(ExitCode.SUCCESS);
    expect(mockConsoleLog).toHaveBeenCalledWith('No MCP servers configured');
  });

  it('should handle initialization errors', async () => {
    mockMCPProvider.initialize.mockRejectedValue(new Error('Initialization failed'));

    const result = await mcpCommand(['status'], mockConfig);

    expect(result).toBe(ExitCode.LLM_EXECUTION);
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Operation failed: MCP command')
    );
  });

  it('should display server status with servers', async () => {
    mockMCPProvider.getHealthInfo.mockReturnValue({
      healthy: true,
      serverCount: 1,
      connectedServers: 1,
      toolCount: 2,
      servers: [
        {
          name: 'test-server',
          status: { status: 'connected', toolCount: 2 },
        },
      ],
    });

    const result = await mcpCommand(['status'], mockConfig);

    expect(result).toBe(ExitCode.SUCCESS);
    expect(mockConsoleLog).toHaveBeenCalledWith('MCP Server Status:');
    expect(mockConsoleLog).toHaveBeenCalledWith('Total servers: 1');
    expect(mockConsoleLog).toHaveBeenCalledWith('Connected: 1');
    expect(mockConsoleLog).toHaveBeenCalledWith('Available tools: 2');
    expect(mockConsoleLog).toHaveBeenCalledWith('test-server: 🟢 Connected');
  });

  it('should display tools when available', async () => {
    const mockTools = [
      {
        id: 'server1_tool1',
        serverName: 'server1',
        name: 'tool1',
        description: 'Test tool',
        inputSchema: {},
        execute: vi.fn(),
      },
    ];

    mockMCPProvider.getTools.mockReturnValue(mockTools);

    const result = await mcpCommand(['tools'], mockConfig);

    expect(result).toBe(ExitCode.SUCCESS);
    expect(mockConsoleLog).toHaveBeenCalledWith('Available MCP Tools:');
    expect(mockConsoleLog).toHaveBeenCalledWith('Total tools: 1');
    expect(mockConsoleLog).toHaveBeenCalledWith('server1 (1 tools):');
    expect(mockConsoleLog).toHaveBeenCalledWith('  - tool1: Test tool');
    expect(mockConsoleLog).toHaveBeenCalledWith('    ID: server1_tool1');
  });
});
