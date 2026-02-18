import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPProvider } from '../../src/providers/mcp.js';
import { toolRegistry } from '../../src/core/tool-registry.js';
import { isMCPAggregateStatusChunk } from '../../src/providers/types.js';

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
      await expect(async () => await mcpProvider.initialize()).not.toThrow();

      const healthInfo = mcpProvider.getHealthInfo();
      expect(healthInfo.serverCount).toBe(0);
      expect(healthInfo.connectedServers).toBe(0);
      expect(healthInfo.toolCount).toBe(0);
    });

    it('should initialize with empty MCP configuration', async () => {
      const config = {
        mcp: {},
      } as any;

      await expect(async () => await mcpProvider.initialize(config)).not.toThrow();

      const healthInfo = mcpProvider.getHealthInfo();
      expect(healthInfo.serverCount).toBe(0);
      expect(healthInfo.toolCount).toBe(0);
    });

    it('should not initialize twice', async () => {
      await mcpProvider.initialize();

      // Second initialization should be a no-op
      await expect(async () => await mcpProvider.initialize()).not.toThrow();

      expect(mcpProvider.isHealthy()).toBe(false); // No servers configured
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

      await expect(async () => await mcpProvider.refresh()).not.toThrow();
    });
  });

  describe('Status Chunk Generation', () => {
    it('should generate MCP aggregate status chunk with empty configuration', async () => {
      await mcpProvider.initialize();

      const statusChunk = mcpProvider.getStatusChunk();

      expect(isMCPAggregateStatusChunk(statusChunk)).toBe(true);
      if (isMCPAggregateStatusChunk(statusChunk)) {
        expect(statusChunk.type).toBe('mcp_aggregate_status');
        expect(statusChunk.serverCount).toBe(0);
        expect(statusChunk.connectedServers).toBe(0);
        expect(statusChunk.toolCount).toBe(0);
        expect(statusChunk.availableTools).toEqual([]);
      }
    });

    it('should generate status chunk with session and context options', async () => {
      await mcpProvider.initialize();

      const options = { sessionId: 'test-session', contextId: 'test-context' };
      const statusChunk = mcpProvider.getStatusChunk(options);

      expect(isMCPAggregateStatusChunk(statusChunk)).toBe(true);
      if (isMCPAggregateStatusChunk(statusChunk)) {
        expect(statusChunk.sessionId).toBe('test-session');
        expect(statusChunk.contextId).toBe('test-context');
      }
    });

    it('should generate status chunk without optional parameters', async () => {
      await mcpProvider.initialize();

      const statusChunk = mcpProvider.getStatusChunk();

      expect(isMCPAggregateStatusChunk(statusChunk)).toBe(true);
      if (isMCPAggregateStatusChunk(statusChunk)) {
        expect(statusChunk.sessionId).toBeUndefined();
        expect(statusChunk.contextId).toBeUndefined();
      }
    });
  });
});
