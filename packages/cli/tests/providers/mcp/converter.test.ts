import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertMCPTool,
  convertMCPTools,
  convertMCPToolToDefinition,
  validateMCPTool,
  extractServerName,
  extractOriginalToolName,
  isMCPTool,
  getMCPToolMetadata,
  type MCPToolDefinition,
  type ExecutableTool,
} from '../../../src/providers/mcp/converter.js';
import type { MCPTool } from '../../../src/providers/mcp/manager.js';

// Mock MCP client
const mockClient = {
  callTool: vi.fn(),
};

describe('MCP Tool Converter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('convertMCPTool', () => {
    it('should convert MCP tool to CIA Agent tool format', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        description: 'Test tool description',
        inputSchema: {
          properties: {
            input: { type: 'string' },
          },
        },
      };

      const result = convertMCPTool(mcpTool, mockClient as any, 'test-server');

      expect(result.name).toBe('test-server_test_tool');
      expect(result.type).toBe('mcp');
      expect(result.description).toBe('Test tool description');
      expect(result.schema).toEqual({
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
        additionalProperties: false,
      });
      expect(result.metadata).toEqual({
        serverName: 'test-server',
        originalName: 'test_tool',
        source: 'mcp',
        timeout: 30_000,
      });
      expect(typeof result.execute).toBe('function');
    });

    it('should handle MCP tool without description', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        inputSchema: {},
      };

      const result = convertMCPTool(mcpTool, mockClient as any, 'test-server');

      expect(result.description).toBe('MCP tool test_tool from test-server');
    });

    it('should handle MCP tool without input schema', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {},
      };

      const result = convertMCPTool(mcpTool, mockClient as any, 'test-server');

      expect(result.schema).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false,
      });
    });

    it('should use custom timeout when provided', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        inputSchema: {},
      };

      const result = convertMCPTool(mcpTool, mockClient as any, 'test-server', 60_000);

      expect(result.metadata?.timeout).toBe(60_000);
    });
  });

  describe('tool execution', () => {
    it('should execute MCP tool successfully', async () => {
      const mockResult = { content: 'test result' };
      mockClient.callTool.mockResolvedValue(mockResult);

      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        inputSchema: {},
      };

      const converted = convertMCPTool(mcpTool, mockClient as any, 'test-server');
      const result = await converted.execute({ input: 'test' });

      expect(result).toBe(mockResult);
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'test_tool',
        arguments: { input: 'test' },
      });
    });

    it('should handle tool execution errors', async () => {
      mockClient.callTool.mockRejectedValue(new Error('Tool execution failed'));

      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        inputSchema: {},
      };

      const converted = convertMCPTool(mcpTool, mockClient as any, 'test-server');

      await expect(converted.execute({})).rejects.toThrow(
        'MCP tool execution failed: Tool execution failed'
      );
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'test_tool',
        arguments: {},
      });
    });

    it('should handle timeout during tool execution', async () => {
      // Mock a long-running operation
      mockClient.callTool.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        inputSchema: {},
      };

      const converted = convertMCPTool(mcpTool, mockClient as any, 'test-server', 50);

      await expect(converted.execute({})).rejects.toThrow('Operation timed out after 50ms');
    });

    it('should handle null/undefined arguments', async () => {
      const mockResult = { content: 'test result' };
      mockClient.callTool.mockResolvedValue(mockResult);

      const mcpTool: MCPToolDefinition = {
        name: 'test_tool',
        inputSchema: {},
      };

      const converted = convertMCPTool(mcpTool, mockClient as any, 'test-server');
      const result = await converted.execute(null);

      expect(result).toBe(mockResult);
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'test_tool',
        arguments: {},
      });
    });
  });

  describe('convertMCPTools', () => {
    it('should convert multiple MCP tools', () => {
      const mcpTools: MCPToolDefinition[] = [
        { name: 'tool1', inputSchema: {} },
        { name: 'tool2', description: 'Tool 2', inputSchema: {} },
      ];

      const result = convertMCPTools(mcpTools, mockClient as any, 'test-server');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('test-server_tool1');
      expect(result[1].name).toBe('test-server_tool2');
      expect(result[1].description).toBe('Tool 2');
    });

    it('should handle empty tool array', () => {
      const result = convertMCPTools([], mockClient as any, 'test-server');
      expect(result).toHaveLength(0);
    });
  });

  describe('convertMCPToolToDefinition', () => {
    it('should convert existing MCPTool to ToolDefinition', () => {
      const mcpTool: MCPTool = {
        id: 'server1_tool1',
        serverName: 'server1',
        name: 'tool1',
        description: 'Test tool',
        inputSchema: { properties: { input: { type: 'string' } } },
        execute: vi.fn(),
      };

      const result = convertMCPToolToDefinition(mcpTool);

      expect(result.name).toBe('server1_tool1');
      expect(result.type).toBe('mcp');
      expect(result.description).toBe('Test tool');
      expect(result.metadata).toEqual({
        serverName: 'server1',
        originalName: 'tool1',
        source: 'mcp',
      });
      expect(result.execute).toBe(mcpTool.execute);
    });
  });

  describe('validateMCPTool', () => {
    it('should validate valid MCP tool', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'valid_tool',
        description: 'Valid tool',
        inputSchema: { properties: {} },
      };

      const result = validateMCPTool(mcpTool);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject tool without name', () => {
      const mcpTool: MCPToolDefinition = {
        name: '',
        inputSchema: {},
      };

      const result = validateMCPTool(mcpTool);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MCP tool name is required and must be a non-empty string');
    });

    it('should reject tool with invalid name characters', () => {
      const mcpTool: MCPToolDefinition = {
        name: 'invalid name!',
        inputSchema: {},
      };

      const result = validateMCPTool(mcpTool);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'MCP tool name must contain only alphanumeric characters, dashes, and underscores'
      );
    });

    it('should reject tool with invalid input schema', () => {
      const mcpTool = {
        name: 'valid_tool',
        inputSchema: 'invalid',
      } as any;

      const result = validateMCPTool(mcpTool);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MCP tool inputSchema must be an object');
    });
  });

  describe('utility functions', () => {
    it('should extract server name from tool ID', () => {
      expect(extractServerName('server1_tool1')).toBe('server1');
      expect(extractServerName('complex-server_complex_tool')).toBe('complex-server');
      expect(extractServerName('invalid')).toBe(null);
    });

    it('should extract original tool name from tool ID', () => {
      expect(extractOriginalToolName('server1_tool1')).toBe('tool1');
      expect(extractOriginalToolName('server1_complex_tool_name')).toBe('complex_tool_name');
      expect(extractOriginalToolName('invalid')).toBe('invalid');
    });

    it('should identify MCP tools correctly', () => {
      const mcpTool: ExecutableTool = {
        name: 'test',
        type: 'mcp',
        metadata: { source: 'mcp' },
        execute: vi.fn(),
      };

      const nonMcpTool: ExecutableTool = {
        name: 'test',
        type: 'bash',
        execute: vi.fn(),
      };

      expect(isMCPTool(mcpTool)).toBe(true);
      expect(isMCPTool(nonMcpTool)).toBe(false);
    });

    it('should get MCP tool metadata safely', () => {
      const mcpTool: ExecutableTool = {
        name: 'test',
        type: 'mcp',
        metadata: {
          source: 'mcp',
          serverName: 'test-server',
          originalName: 'test_tool',
          timeout: 45_000,
        },
        execute: vi.fn(),
      };

      const metadata = getMCPToolMetadata(mcpTool);

      expect(metadata.serverName).toBe('test-server');
      expect(metadata.originalName).toBe('test_tool');
      expect(metadata.timeout).toBe(45_000);
    });

    it('should return empty metadata for non-MCP tools', () => {
      const nonMcpTool: ExecutableTool = {
        name: 'test',
        type: 'bash',
        execute: vi.fn(),
      };

      const metadata = getMCPToolMetadata(nonMcpTool);

      expect(metadata).toEqual({});
    });
  });
});
