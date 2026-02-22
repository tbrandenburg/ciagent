/**
 * MCP Manager for CIA Agent - Enhanced implementation with reliability
 * Based on OpenCode patterns but adapted for CIA Agent's IAssistantClient interface
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { createOAuthProvider } from './auth.js';
import type {
  MCPServerConfig,
  MCPLocalServerConfig,
  MCPRemoteServerConfig,
} from '../../shared/config/schema.js';
import type { ChildProcess } from 'node:child_process';
import {
  withTimeout,
  executeWithReliability,
  connectionMonitor,
  DEFAULT_TIMEOUT,
} from './reliability.js';

export interface MCPTool {
  id: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: any;
  execute: (args: unknown) => Promise<any>;
}

// Enhanced status system based on OpenCode
export type MCPServerStatus =
  | { status: 'connected'; toolCount: number }
  | { status: 'disabled' }
  | { status: 'failed'; error: string }
  | { status: 'needs_auth' }
  | { status: 'needs_client_registration'; error: string }
  | { status: 'connecting' };

export interface MCPServerInfo {
  name: string;
  status: MCPServerStatus;
}

export class MCPManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<
    string,
    StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport
  > = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private status: Map<string, MCPServerStatus> = new Map();
  private config: Record<string, MCPServerConfig> = {};
  private logLevel?: string;

  constructor(logLevel?: string) {
    this.logLevel = logLevel;
    // Handle cleanup on process exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  setLogLevel(logLevel?: string): void {
    this.logLevel = logLevel;
  }

  private isDebugEnabled(): boolean {
    return this.logLevel?.toUpperCase() === 'DEBUG';
  }

  private redactProxy(proxyUrl: string): string {
    try {
      const parsed = new URL(proxyUrl);
      if (parsed.username || parsed.password) {
        parsed.username = '***';
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return '[invalid proxy url]';
    }
  }

  private logRemoteNetworkContext(serverName: string): void {
    if (!this.isDebugEnabled()) {
      return;
    }

    const httpsProxy = process.env.HTTPS_PROXY;
    const httpProxy = process.env.HTTP_PROXY;
    const noProxy = process.env.NO_PROXY;
    const caBundle = process.env.NODE_EXTRA_CA_CERTS;
    const useEnvProxy = process.env.NODE_USE_ENV_PROXY;

    const activeProxy = httpsProxy || httpProxy;
    const proxyValue = activeProxy ? this.redactProxy(activeProxy) : 'none';

    console.log(
      `[MCP] Network diagnostics for ${serverName}: proxy=${proxyValue}, no_proxy=${noProxy || 'none'}, ca_bundle=${caBundle || 'none'}, node_use_env_proxy=${useEnvProxy || 'unset'}`
    );
  }

  /**
   * Initialize MCP manager with server configurations
   */
  async initialize(mcpConfig: Record<string, MCPServerConfig> = {}) {
    this.config = mcpConfig;

    console.log(`[MCP] Initializing with ${Object.keys(mcpConfig).length} servers`);

    // Connect to all enabled servers
    const connectionPromises = Object.entries(mcpConfig)
      .filter(([_, config]) => config.enabled !== false)
      .map(([name, config]) => this.connectToServer(name, config));

    await Promise.allSettled(connectionPromises);

    console.log(
      `[MCP] Connected to ${this.clients.size} servers, ${this.tools.size} tools available`
    );
  }

  /**
   * Connect to a single MCP server with enhanced error handling and status tracking
   */
  async connectToServer(name: string, config: MCPServerConfig): Promise<void> {
    // Mark as connecting
    this.status.set(name, { status: 'connecting' });
    connectionMonitor.updateHealth(name, false);

    try {
      console.log(`[MCP] Connecting to ${name} (${config.type})...`);

      const result = await executeWithReliability(() => this.createConnection(name, config), {
        timeout: config.timeout ?? DEFAULT_TIMEOUT,
        retryOptions: { attempts: 2, delay: 1000 },
      });

      if (!result) {
        this.status.set(name, { status: 'failed', error: 'Unknown error' });
        connectionMonitor.updateHealth(name, false, 'Unknown error');
        return;
      }

      this.status.set(name, result.status);

      if (result.client) {
        // Close existing client if present to prevent memory leaks
        const existingClient = this.clients.get(name);
        if (existingClient) {
          await existingClient.close().catch(error => {
            console.error(`[MCP] Failed to close existing client ${name}:`, error);
          });
        }

        this.clients.set(name, result.client);
        if (result.transport) {
          this.transports.set(name, result.transport);
        }

        // Discover tools from the connected server
        await this.discoverTools(name);

        console.log(`[MCP] Successfully connected to ${name}`);
        connectionMonitor.updateHealth(name, true);
      } else {
        connectionMonitor.updateHealth(name, false, 'No client created');
      }
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${name}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.status.set(name, {
        status: 'failed',
        error: errorMessage,
      });
      connectionMonitor.updateHealth(name, false, errorMessage);
    }
  }

  /**
   * Create MCP connection using OpenCode patterns
   */
  private async createConnection(
    name: string,
    config: MCPServerConfig
  ): Promise<{
    client?: Client;
    transport?: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
    status: MCPServerStatus;
  } | null> {
    if (config.enabled === false) {
      console.log(`[MCP] Server ${name} is disabled`);
      return { status: { status: 'disabled' } };
    }

    const timeout = config.timeout ?? DEFAULT_TIMEOUT;

    if (config.type === 'local') {
      return this.createLocalConnection(name, config, timeout);
    } else if (config.type === 'remote') {
      return this.createRemoteConnection(name, config, timeout);
    }

    return null;
  }

  /**
   * Create local MCP connection via stdio
   */
  private async createLocalConnection(
    name: string,
    config: MCPLocalServerConfig,
    timeout: number
  ): Promise<{
    client: Client;
    transport: StdioClientTransport;
    status: MCPServerStatus;
  }> {
    const transport = new StdioClientTransport({
      stderr: 'pipe',
      command: config.command,
      args: config.args || [],
      env: {
        ...process.env,
        ...(config.environment || {}),
      } as Record<string, string>,
    });

    try {
      const client = new Client({
        name: 'CIA Agent',
        version: '0.1.0',
      });

      await withTimeout(client.connect(transport), timeout);
      this.registerNotificationHandlers(client, name);

      // Get tools count for status
      const toolsResult = await withTimeout(client.listTools(), timeout).catch(() => undefined);
      const toolCount = toolsResult?.tools?.length || 0;

      return {
        client,
        transport,
        status: { status: 'connected', toolCount },
      };
    } catch (error) {
      console.error(`[MCP] Local server startup failed:`, {
        name,
        command: config.command,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        client: undefined as any,
        transport: undefined as any,
        status: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Create remote MCP connection with multiple transport fallback
   */
  private async createRemoteConnection(
    name: string,
    config: MCPRemoteServerConfig,
    timeout: number
  ): Promise<{
    client?: Client;
    transport?: StreamableHTTPClientTransport | SSEClientTransport;
    status: MCPServerStatus;
  }> {
    // Handle OAuth authentication if configured
    const authHeaders: Record<string, string> = {};

    if (config.oauth !== false && config.oauth) {
      const authProvider = createOAuthProvider(name, config.url, config);
      if (authProvider) {
        // Get valid token (refresh if needed)
        const token = await authProvider.getValidToken();
        if (token) {
          authHeaders['Authorization'] = `Bearer ${token.access_token}`;
        } else {
          // No valid token available - user needs to authenticate
          console.log(`🔐 Authentication required for ${name}. Run: cia mcp auth ${name}`);
          return {
            status: { status: 'needs_auth' },
          };
        }
      }
    }

    this.logRemoteNetworkContext(name);

    const transports: Array<{
      name: string;
      transport: StreamableHTTPClientTransport | SSEClientTransport;
    }> = [
      {
        name: 'StreamableHTTP',
        transport: new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: config.headers
            ? { headers: { ...config.headers, ...authHeaders } }
            : authHeaders.Authorization
              ? { headers: authHeaders }
              : undefined,
        }),
      },
      {
        name: 'SSE',
        transport: new SSEClientTransport(new URL(config.url), {
          requestInit: config.headers ? { headers: config.headers } : undefined,
        }),
      },
    ];

    let lastError: Error | undefined;

    for (const { name: transportName, transport } of transports) {
      try {
        const client = new Client({
          name: 'CIA Agent',
          version: '0.1.0',
        });

        await withTimeout(client.connect(transport), timeout);
        this.registerNotificationHandlers(client, name);

        // Get tools count for status
        const toolsResult = await withTimeout(client.listTools(), timeout).catch(() => undefined);
        const toolCount = toolsResult?.tools?.length || 0;

        console.log(`[MCP] Connected to ${name} using ${transportName} transport`);

        return {
          client,
          transport,
          status: { status: 'connected', toolCount },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Handle OAuth-specific errors
        if (error instanceof UnauthorizedError) {
          if (config.oauth !== false && config.oauth) {
            console.log(`🔐 Authentication required for ${name}. Run: cia mcp auth ${name}`);
            return {
              status: { status: 'needs_auth' },
            };
          }
          console.log(
            `[MCP] Server ${name} requires authentication but no OAuth config provided (${transportName})`
          );
          return {
            status: { status: 'needs_auth' },
          };
        }

        console.log(`[MCP] Transport ${transportName} failed for ${name}:`, lastError.message);
      }
    }

    return {
      status: {
        status: 'failed',
        error: lastError?.message || 'All transports failed',
      },
    };
  }

  /**
   * Register notification handlers for MCP client
   */
  private registerNotificationHandlers(client: Client, serverName: string): void {
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      console.log(`[MCP] Tools list changed for ${serverName}`);
      // Re-discover tools for this server
      await this.discoverTools(serverName);
    });
  }

  /**
   * Discover tools from a connected server
   */
  private async discoverTools(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`No client found for server: ${serverName}`);
    }

    try {
      const response = await client.listTools();

      const tools = response.tools || [];

      for (const tool of tools) {
        const mcpTool: MCPTool = {
          id: `${serverName}_${tool.name}`,
          serverName,
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {},
          execute: async (args: unknown) => {
            return await this.callTool(serverName, tool.name, args);
          },
        };

        this.tools.set(mcpTool.id, mcpTool);
      }

      console.log(`[MCP] Discovered ${tools.length} tools from ${serverName}`);
    } catch (error) {
      console.error(`[MCP] Failed to discover tools from ${serverName}:`, error);
    }
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(serverName: string, toolName: string, args: unknown): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`No client found for server: ${serverName}`);
    }

    try {
      const response = await client.callTool({
        name: toolName,
        arguments: args as Record<string, unknown> | undefined,
      });

      return response;
    } catch (error) {
      console.error(`[MCP] Tool call failed for ${serverName}.${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Get all available tools
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a specific tool by ID
   */
  getTool(toolId: string): MCPTool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get server status with health information
   */
  getStatus(): MCPServerInfo[] {
    return Object.keys(this.config).map(name => {
      const serverStatus = this.status.get(name);
      return {
        name,
        status: serverStatus || { status: 'disabled' },
      };
    });
  }

  /**
   * Get detailed health status for all servers
   */
  getHealthStatus() {
    return connectionMonitor.getAllHealth();
  }

  /**
   * Check if a specific server is healthy
   */
  isServerHealthy(serverName: string): boolean {
    return connectionMonitor.isHealthy(serverName);
  }

  /**
   * Get list of unhealthy servers
   */
  getUnhealthyServers(): string[] {
    return connectionMonitor.getUnhealthyServers();
  }

  /**
   * Disconnect from a server
   */
  async disconnectServer(name: string): Promise<void> {
    const transport = this.transports.get(name);
    if (transport) {
      try {
        await transport.close();
      } catch (error) {
        console.error(`[MCP] Error closing transport for ${name}:`, error);
      }
      this.transports.delete(name);
    }

    const client = this.clients.get(name);
    if (client) {
      this.clients.delete(name);
    }

    const process = this.processes.get(name);
    if (process) {
      process.kill();
      this.processes.delete(name);
    }

    // Remove tools from this server
    for (const [toolId, tool] of this.tools.entries()) {
      if (tool.serverName === name) {
        this.tools.delete(toolId);
      }
    }

    // Remove from connection monitoring
    connectionMonitor.removeServer(name);

    console.log(`[MCP] Disconnected from ${name}`);
  }

  /**
   * Get detailed status for all servers with enhanced diagnostics
   */
  async getDetailedStatus(): Promise<{
    serverCount: number;
    connectedServers: number;
    failedServers: number;
    toolCount: number;
    servers: Array<{
      name: string;
      status: MCPServerStatus;
      config: MCPServerConfig;
      toolCount?: number;
      connectionTime?: Date;
      lastError?: string;
    }>;
    healthSummary: Record<string, any>;
  }> {
    const servers = Object.keys(this.config).map(name => {
      const serverStatus = this.status.get(name);
      const config = this.config[name];
      const client = this.clients.get(name);

      return {
        name,
        status: serverStatus || { status: 'disabled' },
        config,
        toolCount: client ? this.getServerTools(name).length : 0,
        connectionTime: serverStatus?.status === 'connected' ? new Date() : undefined,
        lastError:
          serverStatus?.status === 'failed' && 'error' in serverStatus
            ? serverStatus.error
            : undefined,
      };
    });

    const connectedServers = servers.filter(s => s.status.status === 'connected').length;
    const failedServers = servers.filter(s => s.status.status === 'failed').length;
    const toolCount = Array.from(this.tools.values()).length;

    return {
      serverCount: servers.length,
      connectedServers,
      failedServers,
      toolCount,
      servers,
      healthSummary: this.getHealthStatus(),
    };
  }

  /**
   * Get connection diagnostics for troubleshooting
   */
  async getConnectionDiagnostics(serverName?: string): Promise<{
    overall: {
      totalServers: number;
      healthyConnections: number;
      unhealthyServers: string[];
      monitoringActive: boolean;
    };
    servers: Array<{
      name: string;
      status: string;
      transport: {
        type: string;
        active: boolean;
        lastActivity?: Date;
      };
      client: {
        connected: boolean;
        capabilities?: any;
        protocolVersion?: string;
      };
      diagnostics: {
        configValid: boolean;
        transportReachable: boolean;
        authenticationStatus: 'none' | 'required' | 'valid' | 'invalid';
        lastConnectionAttempt?: Date;
        consecutiveFailures: number;
      };
    }>;
  }> {
    const targetServers = serverName ? [serverName] : Object.keys(this.config);

    const serverDiagnostics = await Promise.all(
      targetServers.map(async name => {
        const config = this.config[name];
        const status = this.status.get(name);
        const transport = this.transports.get(name);
        const client = this.clients.get(name);

        return {
          name,
          status: status?.status || 'disabled',
          transport: {
            type: config?.type || 'unknown',
            active: !!transport,
            lastActivity: new Date(), // Could be enhanced with actual last activity tracking
          },
          client: {
            connected: !!client,
            capabilities: client ? await this.getServerCapabilities(client) : undefined,
            protocolVersion: client ? '1.0' : undefined, // Could be enhanced to get actual version
          },
          diagnostics: {
            configValid: !!config && (config.type === 'local' ? !!config.command : !!config.url),
            transportReachable: status?.status === 'connected',
            authenticationStatus: 'none' as const, // Could be enhanced based on actual auth config
            lastConnectionAttempt: new Date(), // Could be enhanced with actual tracking
            consecutiveFailures: status?.status === 'failed' ? 1 : 0, // Could be enhanced with actual tracking
          },
        };
      })
    );

    return {
      overall: {
        totalServers: Object.keys(this.config).length,
        healthyConnections: this.clients.size,
        unhealthyServers: this.getUnhealthyServers(),
        monitoringActive: true, // Could be enhanced to check actual monitoring status
      },
      servers: serverDiagnostics,
    };
  }

  /**
   * Get capabilities for a specific client
   */
  private async getServerCapabilities(_client: Client): Promise<any> {
    try {
      // This would need to be implemented based on the MCP client capabilities
      // For now, return a placeholder
      return { tools: true, resources: false, prompts: false };
    } catch (error) {
      console.error('[MCP] Failed to get server capabilities:', error);
      return {};
    }
  }

  /**
   * Get tools for a specific server
   */
  private getServerTools(serverName: string): MCPTool[] {
    return Array.from(this.tools.values()).filter(tool => tool.serverName === serverName);
  }

  /**
   * Clean up all connections and resources
   */
  async cleanup(): Promise<void> {
    console.log('[MCP] Cleaning up connections...');

    const disconnectPromises = Array.from(this.clients.keys()).map(name =>
      this.disconnectServer(name)
    );

    await Promise.allSettled(disconnectPromises);

    // Stop connection monitoring
    connectionMonitor.stopMonitoring();

    console.log('[MCP] Cleanup complete');
  }
}
