import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPProvider } from '../../src/providers/mcp.js';
import { toolRegistry } from '../../src/core/tool-registry.js';

describe('MCPProvider Integration', () => {
  let mcpProvider: MCPProvider;

  beforeEach(() => {
    mcpProvider = new MCPProvider();
    toolRegistry.clearRegistry();
  });

  afterEach(async () => {
    await mcpProvider.cleanup();
    toolRegistry.clearRegistry();
  });

  describe('Initialization', () => {
    it('should initialize without configuration', async () => {
      await expect(mcpProvider.initialize()).resolves.not.toThrow();

      const healthInfo = mcpProvider.getHealthInfo();
      expect(healthInfo.serverCount).toBe(0);
      expect(healthInfo.connectedServers).toBe(0);
      expect(healthInfo.toolCount).toBe(0);
    });

    it('should initialize with empty MCP configuration', async () => {
      const config = {
        mcp: {},
      } as any;

      await expect(mcpProvider.initialize(config)).resolves.not.toThrow();

      const healthInfo = mcpProvider.getHealthInfo();
      expect(healthInfo.serverCount).toBe(0);
      expect(healthInfo.toolCount).toBe(0);
    });

    it('should not initialize twice', async () => {
      await mcpProvider.initialize();

      // Second initialization should be a no-op
      await expect(mcpProvider.initialize()).resolves.not.toThrow();
    });
  });

  describe('Health Checks', () => {
    it('should report healthy status correctly', async () => {
      await mcpProvider.initialize();

      const healthInfo = mcpProvider.getHealthInfo();
      expect(healthInfo).toEqual({
        healthy: false, // No servers connected
        serverCount: 0,
        connectedServers: 0,
        toolCount: 0,
        servers: [],
      });

      expect(mcpProvider.isHealthy()).toBe(false);
    });
  });

  describe('Tool Management', () => {
    it('should return empty tools list initially', async () => {
      await mcpProvider.initialize();

      const tools = mcpProvider.getTools();
      expect(tools).toEqual([]);
    });

    it('should handle tool execution errors gracefully', async () => {
      await mcpProvider.initialize();

      await expect(mcpProvider.executeTool('nonexistent', {})).rejects.toThrow(
        'MCP tool not found: nonexistent'
      );
    });
  });

  describe('Tool Registry Integration', () => {
    it('should not register any tools with empty configuration', async () => {
      expect(toolRegistry.getToolCount()).toBe(0);

      await mcpProvider.initialize();

      // Should still be 0 since no MCP servers are configured
      expect(toolRegistry.getToolCount()).toBe(0);
    });

    it('should clear MCP tools on cleanup', async () => {
      await mcpProvider.initialize();

      // Add some non-MCP tools to verify they're not affected
      toolRegistry.registerTool({
        name: 'non-mcp-tool',
        type: 'other',
        description: 'A non-MCP tool',
      });

      await mcpProvider.cleanup();

      // Non-MCP tools should remain
      expect(toolRegistry.getToolCount()).toBe(1);
      expect(toolRegistry.getTool('non-mcp-tool')).toBeDefined();
    });
  });

  describe('Refresh', () => {
    it('should refresh without errors', async () => {
      await mcpProvider.initialize();

      await expect(mcpProvider.refresh()).resolves.not.toThrow();
    });
  });
});
