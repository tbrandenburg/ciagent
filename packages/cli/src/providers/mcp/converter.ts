/**
 * MCP Tool Conversion Layer
 * Converts MCP tools to CIA Agent's tool registry format
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolDefinition } from '../../core/tool-registry.js';
import type { MCPTool } from './manager.js';

// Default timeout for MCP tool execution (30 seconds)
const DEFAULT_MCP_TIMEOUT = 30_000;

/**
 * MCP Tool Definition from the MCP SDK
 */
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Executable tool interface for CIA Agent
 */
export interface ExecutableTool extends ToolDefinition {
  execute: (args: unknown) => Promise<unknown>;
}

/**
 * Utility function for timeout handling
 */
function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
    ),
  ]);
}

/**
 * Convert an MCP tool definition to CIA Agent's tool registry format
 */
export function convertMCPTool(
  mcpTool: MCPToolDefinition,
  client: Client,
  serverName: string,
  timeout?: number
): ExecutableTool {
  const toolId = `${serverName}_${mcpTool.name}`;

  // Normalize the input schema to ensure it's a proper JSON Schema object
  const inputSchema = {
    type: 'object',
    properties: mcpTool.inputSchema?.properties ?? {},
    additionalProperties: false,
    ...(mcpTool.inputSchema ?? {}),
  };

  return {
    name: toolId,
    type: 'mcp',
    description: mcpTool.description || `MCP tool ${mcpTool.name} from ${serverName}`,
    schema: inputSchema,
    metadata: {
      serverName,
      originalName: mcpTool.name,
      source: 'mcp',
      timeout: timeout ?? DEFAULT_MCP_TIMEOUT,
    },
    execute: async (args: unknown): Promise<unknown> => {
      try {
        console.log(`[MCP Tool] Executing ${toolId} with args:`, args);

        const result = await withTimeout(
          client.callTool({
            name: mcpTool.name,
            arguments: (args || {}) as Record<string, unknown>,
          }),
          timeout ?? DEFAULT_MCP_TIMEOUT
        );

        console.log(`[MCP Tool] Tool ${toolId} executed successfully`);
        return result;
      } catch (error) {
        console.error(`[MCP Tool] Tool ${toolId} execution failed:`, error);
        throw new Error(
          `MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  };
}

/**
 * Convert multiple MCP tools from a server
 */
export function convertMCPTools(
  mcpTools: MCPToolDefinition[],
  client: Client,
  serverName: string,
  timeout?: number
): ExecutableTool[] {
  return mcpTools.map(tool => convertMCPTool(tool, client, serverName, timeout));
}

/**
 * Convert an existing MCPTool (from manager) to ToolDefinition format
 * This is for backward compatibility with the current MCPTool interface
 */
export function convertMCPToolToDefinition(mcpTool: MCPTool): ExecutableTool {
  return {
    name: mcpTool.id,
    type: 'mcp',
    description: mcpTool.description,
    schema: {
      type: 'object',
      properties: mcpTool.inputSchema?.properties ?? {},
      additionalProperties: false,
      ...(mcpTool.inputSchema ?? {}),
    },
    metadata: {
      serverName: mcpTool.serverName,
      originalName: mcpTool.name,
      source: 'mcp',
    },
    execute: mcpTool.execute,
  };
}

/**
 * Validate MCP tool definition before conversion
 */
export function validateMCPTool(mcpTool: MCPToolDefinition): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!mcpTool.name || typeof mcpTool.name !== 'string' || mcpTool.name.trim() === '') {
    errors.push('MCP tool name is required and must be a non-empty string');
  }

  if (mcpTool.name && !/^[a-zA-Z0-9_-]+$/.test(mcpTool.name)) {
    errors.push('MCP tool name must contain only alphanumeric characters, dashes, and underscores');
  }

  if (mcpTool.inputSchema && typeof mcpTool.inputSchema !== 'object') {
    errors.push('MCP tool inputSchema must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract server name from tool ID (reverse operation)
 */
export function extractServerName(toolId: string): string | null {
  const parts = toolId.split('_');
  return parts.length > 1 ? parts[0] : null;
}

/**
 * Extract original tool name from tool ID
 */
export function extractOriginalToolName(toolId: string): string {
  const parts = toolId.split('_');
  return parts.length > 1 ? parts.slice(1).join('_') : toolId;
}

/**
 * Check if a tool definition is an MCP tool
 */
export function isMCPTool(tool: ToolDefinition): boolean {
  return tool.type === 'mcp' && tool.metadata?.source === 'mcp';
}

/**
 * Get MCP tool metadata safely
 */
export function getMCPToolMetadata(tool: ToolDefinition): {
  serverName?: string;
  originalName?: string;
  timeout?: number;
} {
  if (!isMCPTool(tool)) {
    return {};
  }

  return {
    serverName: tool.metadata?.serverName as string,
    originalName: tool.metadata?.originalName as string,
    timeout: tool.metadata?.timeout as number,
  };
}
