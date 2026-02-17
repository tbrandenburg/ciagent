import Ajv, { JSONSchemaType } from 'ajv';

// Type definitions for enhanced configuration
export interface MCPServerConfig {
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

// AJV schemas with compile-time type safety
export const mcpServerConfigSchema: JSONSchemaType<MCPServerConfig> = {
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

export const validateMCPServerConfig = ajv.compile(mcpServerConfigSchema);
export const validateSkillsConfig = ajv.compile(skillsConfigSchema);
export const validateToolRegistryConfig = ajv.compile(toolRegistryConfigSchema);

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
