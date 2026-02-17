import { describe, it, expect, beforeEach } from 'vitest';
import {
  ToolRegistry,
  ToolDefinition,
  ToolValidationResult,
} from '../../src/core/tool-registry.js';

describe('ToolRegistry', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  describe('Tool Registration', () => {
    it('should register a new tool successfully', () => {
      const tool: ToolDefinition = {
        name: 'test-tool',
        type: 'executable',
        description: 'A test tool',
        metadata: { version: '1.0.0' },
      };

      const result = toolRegistry.registerTool(tool);

      expect(result).toBe(true);
      expect(toolRegistry.hasTool('test-tool')).toBe(true);
      expect(toolRegistry.getToolCount()).toBe(1);
    });

    it('should reject duplicate tool registration', () => {
      const tool: ToolDefinition = {
        name: 'duplicate-tool',
        type: 'executable',
      };

      const firstResult = toolRegistry.registerTool(tool);
      const secondResult = toolRegistry.registerTool(tool);

      expect(firstResult).toBe(true);
      expect(secondResult).toBe(false);
      expect(toolRegistry.getToolCount()).toBe(1);
    });

    it('should register multiple different tools', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool-1', type: 'executable' },
        { name: 'tool-2', type: 'script' },
        { name: 'tool-3', type: 'api' },
      ];

      tools.forEach(tool => {
        const result = toolRegistry.registerTool(tool);
        expect(result).toBe(true);
      });

      expect(toolRegistry.getToolCount()).toBe(3);
      tools.forEach(tool => {
        expect(toolRegistry.hasTool(tool.name)).toBe(true);
      });
    });
  });

  describe('Tool Retrieval', () => {
    it('should retrieve registered tool by name', () => {
      const originalTool: ToolDefinition = {
        name: 'retrieval-test',
        type: 'executable',
        description: 'Test retrieval',
        schema: { type: 'object', properties: { input: { type: 'string' } } },
        metadata: { author: 'test' },
      };

      toolRegistry.registerTool(originalTool);
      const retrievedTool = toolRegistry.getTool('retrieval-test');

      expect(retrievedTool).toEqual(originalTool);
      expect(retrievedTool?.name).toBe('retrieval-test');
      expect(retrievedTool?.type).toBe('executable');
      expect(retrievedTool?.description).toBe('Test retrieval');
      expect(retrievedTool?.metadata).toEqual({ author: 'test' });
    });

    it('should return undefined for non-existent tool', () => {
      const retrievedTool = toolRegistry.getTool('non-existent-tool');

      expect(retrievedTool).toBeUndefined();
    });

    it('should check if tool exists', () => {
      expect(toolRegistry.hasTool('test-tool')).toBe(false);

      toolRegistry.registerTool({ name: 'test-tool', type: 'executable' });

      expect(toolRegistry.hasTool('test-tool')).toBe(true);
      expect(toolRegistry.hasTool('other-tool')).toBe(false);
    });
  });

  describe('Tool Listing', () => {
    it('should list tool names', () => {
      const tools: ToolDefinition[] = [
        { name: 'alpha-tool', type: 'executable' },
        { name: 'beta-tool', type: 'script' },
        { name: 'gamma-tool', type: 'api' },
      ];

      tools.forEach(tool => toolRegistry.registerTool(tool));

      const toolNames = toolRegistry.listTools();

      expect(toolNames).toHaveLength(3);
      expect(toolNames).toContain('alpha-tool');
      expect(toolNames).toContain('beta-tool');
      expect(toolNames).toContain('gamma-tool');
    });

    it('should get all tool definitions', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool-1', type: 'executable', description: 'First tool' },
        { name: 'tool-2', type: 'script', description: 'Second tool' },
      ];

      tools.forEach(tool => toolRegistry.registerTool(tool));

      const allTools = toolRegistry.getAllTools();

      expect(allTools).toHaveLength(2);
      expect(allTools).toEqual(expect.arrayContaining(tools));
    });

    it('should return empty arrays when no tools registered', () => {
      expect(toolRegistry.listTools()).toEqual([]);
      expect(toolRegistry.getAllTools()).toEqual([]);
      expect(toolRegistry.getToolCount()).toBe(0);
    });
  });

  describe('Tool Validation', () => {
    it('should validate tool with all required fields', () => {
      const validTool = {
        name: 'valid-tool',
        type: 'executable',
      };

      const result = toolRegistry.validateTool(validTool);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject tool with missing name', () => {
      const invalidTool = {
        type: 'executable',
      };

      const result = toolRegistry.validateTool(invalidTool);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool name is required and must be a non-empty string');
    });

    it('should reject tool with missing type', () => {
      const invalidTool = {
        name: 'test-tool',
      };

      const result = toolRegistry.validateTool(invalidTool);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool type is required and must be a non-empty string');
    });

    it('should reject tool with empty name', () => {
      const invalidTool = {
        name: '',
        type: 'executable',
      };

      const result = toolRegistry.validateTool(invalidTool);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool name is required and must be a non-empty string');
    });

    it('should reject tool with invalid name characters', () => {
      const invalidTool = {
        name: 'invalid@tool#name',
        type: 'executable',
      };

      const result = toolRegistry.validateTool(invalidTool);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Tool name must contain only alphanumeric characters, dashes, and underscores'
      );
    });

    it('should accept tool with valid name characters', () => {
      const validNames = ['tool-name', 'tool_name', 'toolName123', 'TOOL-NAME-2'];

      validNames.forEach(name => {
        const validTool = { name, type: 'executable' };
        const result = toolRegistry.validateTool(validTool);
        expect(result.valid).toBe(true);
      });
    });

    it('should validate tool with valid JSON schema', () => {
      const toolWithSchema = {
        name: 'schema-tool',
        type: 'api',
        schema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
            count: { type: 'number' },
          },
          required: ['input'],
        },
      };

      const result = toolRegistry.validateTool(toolWithSchema);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject tool with invalid JSON schema', () => {
      const toolWithInvalidSchema = {
        name: 'invalid-schema-tool',
        type: 'api',
        schema: {
          type: 'invalid-type', // Invalid JSON Schema type
        },
      };

      const result = toolRegistry.validateTool(toolWithInvalidSchema);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('Invalid tool schema');
    });

    it('should collect multiple validation errors', () => {
      const invalidTool = {
        name: '',
        type: '',
        schema: { type: 'invalid-type' },
      };

      const result = toolRegistry.validateTool(invalidTool);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('Tool name is required and must be a non-empty string');
      expect(result.errors).toContain('Tool type is required and must be a non-empty string');
      expect(result.errors?.[2]).toContain('Invalid tool schema');
    });
  });

  describe('Tool Removal', () => {
    it('should remove existing tool', () => {
      const tool: ToolDefinition = { name: 'removable-tool', type: 'executable' };

      toolRegistry.registerTool(tool);
      expect(toolRegistry.hasTool('removable-tool')).toBe(true);

      const result = toolRegistry.unregisterTool('removable-tool');

      expect(result).toBe(true);
      expect(toolRegistry.hasTool('removable-tool')).toBe(false);
      expect(toolRegistry.getToolCount()).toBe(0);
    });

    it('should return false when removing non-existent tool', () => {
      const result = toolRegistry.unregisterTool('non-existent-tool');

      expect(result).toBe(false);
      expect(toolRegistry.getToolCount()).toBe(0);
    });

    it('should clear all tools from registry', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool-1', type: 'executable' },
        { name: 'tool-2', type: 'script' },
        { name: 'tool-3', type: 'api' },
      ];

      tools.forEach(tool => toolRegistry.registerTool(tool));
      expect(toolRegistry.getToolCount()).toBe(3);

      toolRegistry.clearRegistry();

      expect(toolRegistry.getToolCount()).toBe(0);
      expect(toolRegistry.listTools()).toEqual([]);
      tools.forEach(tool => {
        expect(toolRegistry.hasTool(tool.name)).toBe(false);
      });
    });
  });

  describe('Registry Operations with Validation', () => {
    it('should register valid tools and reject invalid ones', () => {
      const validTool: ToolDefinition = {
        name: 'valid-tool',
        type: 'executable',
        description: 'A valid tool',
      };

      const invalidTool = {
        name: '',
        type: 'executable',
      } as ToolDefinition;

      // Validate first, then register valid tools
      const validationResult = toolRegistry.validateTool(validTool);
      expect(validationResult.valid).toBe(true);

      const registrationResult = toolRegistry.registerTool(validTool);
      expect(registrationResult).toBe(true);

      // Invalid tool should fail validation
      const invalidValidationResult = toolRegistry.validateTool(invalidTool);
      expect(invalidValidationResult.valid).toBe(false);

      // But registry still allows registration (validation is advisory)
      // This is expected behavior - validation is separate from registration
      expect(toolRegistry.getToolCount()).toBe(1);
    });

    it('should handle complex tool definitions', () => {
      const complexTool: ToolDefinition = {
        name: 'complex-tool',
        type: 'api',
        description: 'A complex tool with schema and metadata',
        schema: {
          type: 'object',
          properties: {
            endpoint: { type: 'string' }, // Valid JSON schema without format
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['endpoint', 'method'],
        },
        metadata: {
          version: '2.1.0',
          author: 'test-author',
          tags: ['api', 'http', 'rest'],
          documentation: 'https://example.com/docs',
          deprecated: false,
        },
      };

      const validationResult = toolRegistry.validateTool(complexTool);
      expect(validationResult.valid).toBe(true);

      const registrationResult = toolRegistry.registerTool(complexTool);
      expect(registrationResult).toBe(true);

      const retrievedTool = toolRegistry.getTool('complex-tool');
      expect(retrievedTool).toEqual(complexTool);
    });
  });

  describe('Empty Registry Behavior', () => {
    it('should handle empty registry gracefully', () => {
      expect(toolRegistry.getToolCount()).toBe(0);
      expect(toolRegistry.listTools()).toEqual([]);
      expect(toolRegistry.getAllTools()).toEqual([]);
      expect(toolRegistry.hasTool('any-tool')).toBe(false);
      expect(toolRegistry.getTool('any-tool')).toBeUndefined();
      expect(toolRegistry.unregisterTool('any-tool')).toBe(false);

      // Clear empty registry should not throw
      toolRegistry.clearRegistry();
      expect(toolRegistry.getToolCount()).toBe(0);
    });
  });
});
