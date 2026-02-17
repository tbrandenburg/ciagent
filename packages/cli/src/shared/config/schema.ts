import Ajv, { JSONSchemaType } from 'ajv';

// Enhanced MCP configuration to match OpenCode standards with discriminated union types
export interface MCPServerConfigBase {
  type: 'local' | 'remote';
  timeout?: number;
  enabled?: boolean;
}

export interface MCPLocalServerConfig extends MCPServerConfigBase {
  type: 'local';
  command: string;
  args?: string[];
  environment?: Record<string, string>; // Match OpenCode naming: 'environment' not 'env'
}

export interface MCPRemoteServerConfig extends MCPServerConfigBase {
  type: 'remote';
  url: string;
  headers?: Record<string, string>;
  oauth?:
    | {
        clientId: string;
        clientSecret?: string;
        scope?: string;
      }
    | false;
}

// Discriminated union type for MCP server config
export type MCPServerConfig = MCPLocalServerConfig | MCPRemoteServerConfig;

// Legacy interface for backward compatibility during transition
export interface LegacyMCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SkillsConfig {
  sources: Array<{
    name: string;
    path: string;
    enabled?: boolean;
  }>;
}

export interface ToolRegistryConfig {
  enabled?: boolean;
  maxTools?: number;
  timeout?: number;
}

// Schema definitions
export const legacyMcpServerConfigSchema: JSONSchemaType<LegacyMCPServerConfig> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    command: { type: 'string' },
    args: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
    },
    env: {
      type: 'object',
      additionalProperties: { type: 'string' },
      required: [],
      nullable: true,
    },
  },
  required: ['name', 'command'],
  additionalProperties: false,
};

export const skillsConfigSchema: JSONSchemaType<SkillsConfig> = {
  type: 'object',
  properties: {
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
          enabled: { type: 'boolean', nullable: true },
        },
        required: ['name', 'path'],
        additionalProperties: false,
      },
    },
  },
  required: ['sources'],
  additionalProperties: false,
};

export const toolRegistryConfigSchema: JSONSchemaType<ToolRegistryConfig> = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean', nullable: true },
    maxTools: { type: 'number', nullable: true },
    timeout: { type: 'number', nullable: true },
  },
  required: [],
  additionalProperties: false,
};

// Compiled validators for performance
const ajv = new Ajv();

export const validateLegacyMCPServerConfig = ajv.compile(legacyMcpServerConfigSchema);
export const validateSkillsConfig = ajv.compile(skillsConfigSchema);
export const validateToolRegistryConfig = ajv.compile(toolRegistryConfigSchema);

// Simple validation functions for the new MCP config format
export function validateMCPLocalServerConfig(data: any): data is MCPLocalServerConfig {
  return (
    typeof data === 'object' &&
    data !== null &&
    data.type === 'local' &&
    typeof data.command === 'string'
  );
}

export function validateMCPRemoteServerConfig(data: any): data is MCPRemoteServerConfig {
  return (
    typeof data === 'object' &&
    data !== null &&
    data.type === 'remote' &&
    typeof data.url === 'string'
  );
}

// Helper function to validate MCP config (supports both new and legacy formats)
export function validateMCPConfig(data: unknown): MCPServerConfig | LegacyMCPServerConfig {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid MCP configuration: must be an object');
  }

  const obj = data as any;

  // Try new discriminated union format first
  if ('type' in obj) {
    if (obj.type === 'local' && validateMCPLocalServerConfig(obj)) {
      return obj as MCPLocalServerConfig;
    }
    if (obj.type === 'remote' && validateMCPRemoteServerConfig(obj)) {
      return obj as MCPRemoteServerConfig;
    }
    throw new Error(
      `Invalid MCP configuration: unsupported type "${obj.type}" or missing required fields`
    );
  }

  // Fall back to legacy format
  if (validateLegacyMCPServerConfig(obj)) {
    return obj as LegacyMCPServerConfig;
  }

  const errors = validateLegacyMCPServerConfig.errors
    ?.map((err: any) => `${err.instancePath}: ${err.message}`)
    .join(', ');
  throw new Error(`Invalid MCP configuration: ${errors || 'Unknown validation error'}`);
}

// Helper function to validate config sections with proper error handling
export function validateConfigSection<T>(
  data: unknown,
  validator: ReturnType<typeof ajv.compile>,
  sectionName: string
): T {
  if (validator(data)) {
    return data as T;
  }

  const errors =
    validator.errors?.map((err: any) => `${err.instancePath}: ${err.message}`).join(', ') ||
    'Unknown validation error';
  throw new Error(`Invalid ${sectionName} configuration: ${errors}`);
}
