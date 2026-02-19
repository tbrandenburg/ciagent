import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExitCode } from '../../src/utils/exit-codes.js';
import type { CIAConfig } from '../../src/shared/config/loader.js';
import type {
  MCPLocalServerConfig,
  MCPRemoteServerConfig,
} from '../../src/shared/config/schema.js';

// Mock the MCP provider module
const mockMCPProvider = {
  initialize: vi.fn(),
  getHealthInfo: vi.fn(),
  getServerStatus: vi.fn(),
  getTools: vi.fn(),
  refresh: vi.fn(),
};

// Mock the MCP manager for enhanced status methods
const mockMCPManager = {
  getDetailedStatus: vi.fn(),
  getConnectionDiagnostics: vi.fn(),
};

vi.mock('../../src/providers/mcp.js', () => ({
  mcpProvider: mockMCPProvider,
}));

vi.mock('../../src/providers/mcp/manager.js', () => ({
  MCPManager: vi.fn(() => mockMCPManager),
}));

// Import after mocking
const { mcpCommand } = await import('../../src/commands/mcp.js');

// Mock console methods to capture output
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('MCP Commands - Enhanced Tests', () => {
  const mockConfig = {
    provider: 'codex',
    mode: 'lazy',
    format: 'default',
    mcp: {
      servers: [
        {
          name: 'test-server',
          type: 'local',
          command: 'test-mcp-server',
          enabled: true,
        },
        {
          name: 'remote-server',
          type: 'remote',
          url: 'https://example.com/mcp',
          enabled: true,
        },
      ],
    },
  } as unknown as CIAConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockMCPProvider.initialize.mockResolvedValue(undefined);
    mockMCPProvider.getHealthInfo.mockReturnValue({
      healthy: true,
      serverCount: 2,
      connectedServers: 1,
      toolCount: 3,
      servers: [
        {
          name: 'test-server',
          status: { status: 'connected', toolCount: 2 },
        },
        {
          name: 'remote-server',
          status: { status: 'failed', error: 'Connection timeout' },
        },
      ],
    });

    mockMCPProvider.getServerStatus.mockReturnValue([
      {
        name: 'test-server',
        status: { status: 'connected', toolCount: 2 },
      },
      {
        name: 'remote-server',
        status: { status: 'failed', error: 'Connection timeout' },
      },
    ]);

    mockMCPProvider.getTools.mockReturnValue([
      {
        name: 'test_tool',
        serverName: 'test-server',
        description: 'A test tool',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'another_tool',
        serverName: 'test-server',
        description: 'Another test tool',
        inputSchema: { type: 'object', properties: {} },
      },
    ]);

    mockMCPProvider.refresh.mockResolvedValue(undefined);

    mockMCPManager.getDetailedStatus.mockResolvedValue({
      serverCount: 2,
      connectedServers: 1,
      failedServers: 1,
      toolCount: 3,
      servers: [
        {
          name: 'test-server',
          status: { status: 'connected', toolCount: 2 },
          config: { type: 'local', command: 'test-mcp-server', enabled: true },
          toolCount: 2,
          connectionTime: new Date('2026-02-18T10:00:00Z'),
        },
        {
          name: 'remote-server',
          status: { status: 'failed', error: 'Connection timeout' },
          config: { type: 'remote', url: 'https://example.com/mcp', enabled: true },
          toolCount: 0,
          lastError: 'Connection timeout',
        },
      ],
      healthSummary: { healthy: true, overallStatus: 'partial' },
    });

    mockMCPManager.getConnectionDiagnostics.mockResolvedValue({
      overall: {
        totalServers: 2,
        healthyConnections: 1,
        unhealthyServers: ['remote-server'],
        monitoringActive: true,
      },
      servers: [
        {
          name: 'test-server',
          status: 'connected',
          transport: { type: 'local', active: true },
          client: { connected: true, capabilities: { tools: true } },
          diagnostics: {
            configValid: true,
            transportReachable: true,
            authenticationStatus: 'none',
            consecutiveFailures: 0,
          },
        },
        {
          name: 'remote-server',
          status: 'failed',
          transport: { type: 'remote', active: false },
          client: { connected: false },
          diagnostics: {
            configValid: true,
            transportReachable: false,
            authenticationStatus: 'none',
            consecutiveFailures: 3,
          },
        },
      ],
    });
  });

  describe('Enhanced MCP Commands', () => {
    it('should handle add command with server name and URL', async () => {
      const result = await mcpCommand(
        ['add', 'new-server', 'https://example.com/new-mcp'],
        mockConfig
      );

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Adding MCP server: new-server');
      expect(mockConsoleLog).toHaveBeenCalledWith('URL/Command: https://example.com/new-mcp');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"type": "remote"'));
    });

    it('should handle add command with server name and local command', async () => {
      const result = await mcpCommand(['add', 'local-server', 'node server.js'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Adding MCP server: local-server');
      expect(mockConsoleLog).toHaveBeenCalledWith('URL/Command: node server.js');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"type": "local"'));
    });

    it('should require server name for add command', async () => {
      const result = await mcpCommand(['add'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: server name')
      );
    });

    it('should require server URL/command for add command', async () => {
      const result = await mcpCommand(['add', 'server-name'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: server URL')
      );
    });

    it('should handle list command', async () => {
      const result = await mcpCommand(['list'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockMCPProvider.initialize).toHaveBeenCalledWith(mockConfig);
      expect(mockConsoleLog).toHaveBeenCalledWith('Configured MCP Servers:');
      expect(mockConsoleLog).toHaveBeenCalledWith('Total servers: 2');
      expect(mockConsoleLog).toHaveBeenCalledWith('Connected: 1');
      expect(mockConsoleLog).toHaveBeenCalledWith('Available tools: 3');
    });

    it('should handle list command with no servers', async () => {
      mockMCPProvider.getHealthInfo.mockReturnValue({
        healthy: false,
        serverCount: 0,
        connectedServers: 0,
        toolCount: 0,
        servers: [],
      });

      const result = await mcpCommand(['list'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('No MCP servers configured');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'To add a server, use: cia mcp add <name> <url-or-command>'
      );
    });

    it('should handle get command for specific server', async () => {
      const result = await mcpCommand(['get', 'test-server'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('MCP Server Details: test-server');
      expect(mockConsoleLog).toHaveBeenCalledWith('Status: 🟢 Connected');
      expect(mockConsoleLog).toHaveBeenCalledWith('Tools: 2');
    });

    it('should handle get command for non-existent server', async () => {
      const result = await mcpCommand(['get', 'non-existent'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        "Server 'non-existent' not found in configuration"
      );
    });

    it('should require server name for get command', async () => {
      const result = await mcpCommand(['get'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: server name')
      );
    });

    it('should handle remove command', async () => {
      const result = await mcpCommand(['remove', 'test-server'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Removing MCP server: test-server');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('To complete removal, delete the server configuration')
      );
    });

    it('should require server name for remove command', async () => {
      const result = await mcpCommand(['remove'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: server name')
      );
    });

    it('should handle remove command for non-existent server', async () => {
      const result = await mcpCommand(['remove', 'non-existent'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        "Server 'non-existent' not found in configuration"
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle MCP provider initialization errors', async () => {
      mockMCPProvider.initialize.mockRejectedValue(new Error('MCP initialization failed'));

      const result = await mcpCommand(['list'], mockConfig);

      expect(result).toBe(ExitCode.LLM_EXECUTION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Operation failed: MCP command')
      );
    });

    it('should handle invalid command arguments', async () => {
      const result = await mcpCommand(['add', '', 'url'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Invalid argument'));
    });

    it('should handle unknown subcommands gracefully', async () => {
      const result = await mcpCommand(['invalid-command'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Unknown command: mcp invalid-command')
      );
    });
  });

  describe('Status Commands', () => {
    it('should display detailed server information in status', async () => {
      const result = await mcpCommand(['status'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('MCP Server Status:');
      expect(mockConsoleLog).toHaveBeenCalledWith('test-server: 🟢 Connected');
      expect(mockConsoleLog).toHaveBeenCalledWith('remote-server: ❌ Failed');
    });

    it('should show error details for failed servers', async () => {
      const result = await mcpCommand(['status'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Error: Connection timeout')
      );
    });
  });

  describe('Tools Commands', () => {
    it('should list available MCP tools', async () => {
      const result = await mcpCommand(['tools'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Available MCP Tools:');
      expect(mockConsoleLog).toHaveBeenCalledWith('test-server (2 tools):');
      expect(mockConsoleLog).toHaveBeenCalledWith('  - test_tool: A test tool');
      expect(mockConsoleLog).toHaveBeenCalledWith('  - another_tool: Another test tool');
    });

    it('should handle no tools available', async () => {
      mockMCPProvider.getTools.mockReturnValue([]);

      const result = await mcpCommand(['tools'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('No tools available from MCP servers');
      expect(mockConsoleLog).toHaveBeenCalledWith('Check server status with: cia mcp status');
    });
  });

  describe('Integration Tests', () => {
    it('should complete full MCP management workflow', async () => {
      // Test the complete workflow: add -> list -> get -> status -> tools -> remove

      // Step 1: Add a server
      let result = await mcpCommand(
        ['add', 'workflow-server', 'https://example.com/workflow'],
        mockConfig
      );
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Adding MCP server: workflow-server');

      // Step 2: List servers
      result = await mcpCommand(['list'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Configured MCP Servers:');

      // Step 3: Get specific server info
      result = await mcpCommand(['get', 'test-server'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('MCP Server Details: test-server');

      // Step 4: Check status
      result = await mcpCommand(['status'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('MCP Server Status:');

      // Step 5: List tools
      result = await mcpCommand(['tools'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Available MCP Tools:');

      // Step 6: Remove server instructions
      result = await mcpCommand(['remove', 'test-server'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Removing MCP server: test-server');

      // Verify all steps completed successfully
      expect(mockMCPProvider.initialize).toHaveBeenCalledTimes(6);
    });

    it('should handle mixed success/failure scenarios', async () => {
      // Mock a scenario with partial failures
      mockMCPProvider.getHealthInfo.mockReturnValue({
        healthy: true,
        serverCount: 3,
        connectedServers: 2,
        toolCount: 1,
        servers: [
          { name: 'server1', status: { status: 'connected' } },
          { name: 'server2', status: { status: 'connected' } },
          { name: 'server3', status: { status: 'failed', error: 'Network error' } },
        ],
      });

      const result = await mcpCommand(['status'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Connected: 2');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Error: Network error'));
    });
  });
});
