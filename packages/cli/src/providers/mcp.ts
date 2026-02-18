/**
 * MCP Provider for CIA Agent
 * Integrates MCP servers as tool providers within CIA Agent's provider system
 */

import { MCPManager, type MCPTool, type MCPServerInfo } from './mcp/manager.js';
import { convertMCPToolToDefinition } from './mcp/converter.js';
import { toolRegistry } from '../core/tool-registry.js';
import { loadStructuredConfig, type CIAConfig } from '../shared/config/loader.js';
import { type MCPServerConfig } from '../shared/config/schema.js';
import { type MessageChunk, createMCPAggregateStatusChunk } from './types.js';

/**
 * MCP Provider class that manages MCP servers as a tool provider
 */
export class MCPProvider {
  private mcpManager: MCPManager;
  private initialized = false;

  constructor() {
    this.mcpManager = new MCPManager();
  }

  /**
   * Initialize the MCP provider with configuration
   */
  async initialize(config?: CIAConfig): Promise<void> {
    if (this.initialized) {
      console.log('[MCP Provider] Already initialized');
      return;
    }

    try {
      console.log('[MCP Provider] Initializing...');

      // Load MCP configuration safely
      let mcpConfig: Record<string, MCPServerConfig> = {};
      if (config) {
        try {
          const structuredConfig = loadStructuredConfig(config);
          const mcpStructured = structuredConfig?.mcp;

          // Convert from structured format { servers: MCPServerConfig[] } to Record<string, MCPServerConfig>
          if (mcpStructured?.servers && Array.isArray(mcpStructured.servers)) {
            mcpConfig = {};
            for (const server of mcpStructured.servers) {
              // The structured config adds a name field, but we use it as the key instead
              const serverWithName = server as MCPServerConfig & { name: string };
              const { name, ...serverConfig } = serverWithName;
              mcpConfig[name] = serverConfig as MCPServerConfig;
            }
          }
        } catch (error) {
          console.log(
            '[MCP Provider] Failed to load structured config, continuing with empty MCP config:',
            error
          );
          mcpConfig = {};
        }
      }

      // Initialize MCP manager with server configurations
      await this.mcpManager.initialize(mcpConfig);

      // Register all discovered MCP tools in the tool registry
      await this.registerMCPTools();

      this.initialized = true;
      console.log('[MCP Provider] Initialization complete');
    } catch (error) {
      console.error('[MCP Provider] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register all MCP tools in the global tool registry using the converter
   */
  private async registerMCPTools(): Promise<void> {
    const tools = this.mcpManager.getTools();
    let registeredCount = 0;

    for (const mcpTool of tools) {
      // Use the converter to create a proper tool definition
      const toolDefinition = convertMCPToolToDefinition(mcpTool);

      if (toolRegistry.registerTool(toolDefinition)) {
        registeredCount++;
        console.log(`[MCP Provider] Registered tool: ${mcpTool.id} from ${mcpTool.serverName}`);
      } else {
        console.log(`[MCP Provider] Tool ${mcpTool.id} already registered, skipping`);
      }
    }

    console.log(`[MCP Provider] Registered ${registeredCount} MCP tools in tool registry`);
  }

  /**
   * Execute an MCP tool by ID
   */
  async executeTool(toolId: string, args: unknown): Promise<any> {
    if (!this.initialized) {
      throw new Error('MCP Provider not initialized');
    }

    const tool = this.mcpManager.getTool(toolId);
    if (!tool) {
      throw new Error(`MCP tool not found: ${toolId}`);
    }

    try {
      console.log(`[MCP Provider] Executing tool: ${toolId}`);
      const result = await tool.execute(args);
      console.log(`[MCP Provider] Tool execution successful: ${toolId}`);
      return result;
    } catch (error) {
      console.error(`[MCP Provider] Tool execution failed: ${toolId}`, error);
      throw error;
    }
  }

  /**
   * Get status of all MCP servers
   */
  getServerStatus(): MCPServerInfo[] {
    return this.mcpManager.getStatus();
  }

  /**
   * Get all available MCP tools
   */
  getTools(): MCPTool[] {
    return this.mcpManager.getTools();
  }

  /**
   * Check if MCP provider is healthy (at least one server connected)
   */
  isHealthy(): boolean {
    const status = this.getServerStatus();
    return status.some(server => server.status.status === 'connected');
  }

  /**
   * Get health information for diagnostics
   */
  getHealthInfo(): {
    healthy: boolean;
    serverCount: number;
    connectedServers: number;
    toolCount: number;
    servers: MCPServerInfo[];
  } {
    const servers = this.getServerStatus();
    const connectedServers = servers.filter(s => s.status.status === 'connected');

    return {
      healthy: this.isHealthy(),
      serverCount: servers.length,
      connectedServers: connectedServers.length,
      toolCount: this.getTools().length,
      servers,
    };
  }

  /**
   * Get MCP aggregate status as a MessageChunk for orchestration
   */
  getStatusChunk(options?: { sessionId?: string; contextId?: string }): MessageChunk {
    const healthInfo = this.getHealthInfo();
    const tools = this.getTools();

    return createMCPAggregateStatusChunk(
      healthInfo.serverCount,
      healthInfo.connectedServers,
      healthInfo.toolCount,
      tools.map(tool => tool.id),
      options
    );
  }

  /**
   * Refresh MCP connections and re-register tools
   */
  async refresh(): Promise<void> {
    console.log('[MCP Provider] Refreshing connections...');

    // Clear existing MCP tools from registry
    const existingTools = toolRegistry.getAllTools().filter(tool => tool.type === 'mcp');
    for (const tool of existingTools) {
      toolRegistry.unregisterTool(tool.name);
    }

    // Re-register tools after refresh
    await this.registerMCPTools();

    console.log('[MCP Provider] Refresh complete');
  }

  /**
   * Cleanup MCP provider resources
   */
  async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    console.log('[MCP Provider] Cleaning up...');

    // Remove MCP tools from registry
    const mcpTools = toolRegistry.getAllTools().filter(tool => tool.type === 'mcp');
    for (const tool of mcpTools) {
      toolRegistry.unregisterTool(tool.name);
    }

    // Cleanup MCP manager
    await this.mcpManager.cleanup();

    this.initialized = false;
    console.log('[MCP Provider] Cleanup complete');
  }
}

// Export singleton instance for application use
export const mcpProvider = new MCPProvider();
