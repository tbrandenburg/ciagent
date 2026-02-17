import Ajv from 'ajv';

/**
 * Tool definition structure for registry
 */
export interface ToolDefinition {
  readonly name: string;
  readonly type: string;
  readonly description?: string;
  readonly schema?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Tool validation result
 */
export interface ToolValidationResult {
  readonly valid: boolean;
  readonly errors?: string[];
}

/**
 * Tool registry infrastructure (stub implementation for Phase 7.4 preparation)
 * Follows factory/registry pattern similar to createAssistantChat
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition>;
  private ajv: Ajv;

  constructor() {
    this.tools = new Map();
    this.ajv = new Ajv();
  }

  /**
   * Register a new tool in the registry
   * @param tool Tool definition to register
   * @returns true if successfully registered, false if tool already exists
   */
  registerTool(tool: ToolDefinition): boolean {
    if (this.tools.has(tool.name)) {
      return false;
    }

    this.tools.set(tool.name, { ...tool });
    return true;
  }

  /**
   * Retrieve a tool by name
   * @param name Tool name to retrieve
   * @returns ToolDefinition if found, undefined otherwise
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools
   * @returns Array of tool names
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * List all registered tool definitions
   * @returns Array of ToolDefinition objects
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Validate a tool definition using JSON schema
   * @param tool Tool definition to validate
   * @returns ToolValidationResult with validation status and errors
   */
  validateTool(tool: Partial<ToolDefinition>): ToolValidationResult {
    // Basic validation - ensure required fields are present
    const errors: string[] = [];

    if (!tool.name || typeof tool.name !== 'string' || tool.name.trim() === '') {
      errors.push('Tool name is required and must be a non-empty string');
    }

    if (!tool.type || typeof tool.type !== 'string' || tool.type.trim() === '') {
      errors.push('Tool type is required and must be a non-empty string');
    }

    // Validate tool name contains only valid characters (alphanumeric, dash, underscore)
    if (tool.name && !/^[a-zA-Z0-9_-]+$/.test(tool.name)) {
      errors.push('Tool name must contain only alphanumeric characters, dashes, and underscores');
    }

    // Schema validation if provided
    if (tool.schema && typeof tool.schema === 'object') {
      try {
        this.ajv.compile(tool.schema);
      } catch (error) {
        errors.push(
          `Invalid tool schema: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Remove a tool from the registry
   * @param name Tool name to remove
   * @returns true if tool was removed, false if tool was not found
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all tools from the registry
   */
  clearRegistry(): void {
    this.tools.clear();
  }

  /**
   * Get count of registered tools
   * @returns Number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool exists in the registry
   * @param name Tool name to check
   * @returns true if tool exists, false otherwise
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}

// Export a singleton instance for application use
export const toolRegistry = new ToolRegistry();
