/**
 * Skills System Type Definitions
 * Following OpenCode SKILL.md format specification and MCP pattern structure
 */

// Core skill interfaces

export interface SkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly metadata: SkillMetadata;
  readonly source: string;
  readonly location: string; // File path for skill
}

export interface SkillMetadata {
  name: string; // Must match directory name
  description: string; // 1-1024 characters
  license?: string;
  compatibility?: string; // e.g., 'opencode'
  metadata?: Record<string, string>; // String-to-string map
  variables?: Record<string, SkillVariable>;
  examples?: SkillExample[];
}

export interface SkillVariable {
  name: string;
  description: string;
  required?: boolean;
  defaultValue?: string;
}

export interface SkillExample {
  title: string;
  description?: string;
  input: string;
  expected?: string;
}

// Status system mirroring MCP pattern
export type SkillSourceStatus =
  | { status: 'ready'; skillCount: number }
  | { status: 'disabled' }
  | { status: 'failed'; error: string }
  | { status: 'loading' };

export interface SkillSourceInfo {
  name: string;
  type: 'local' | 'remote' | 'opencode';
  path: string;
  status: SkillSourceStatus;
}

// Discovery and registry types
export interface SkillRegistry {
  skills: Map<string, SkillDefinition>;
  sources: Map<string, SkillSourceInfo>;
}

export interface SkillDiscoveryOptions {
  includeDisabled?: boolean;
  sourceType?: 'local' | 'remote' | 'opencode' | 'all';
}

// Template processing types
export interface SkillTemplateContext {
  variables: Record<string, string>;
  userPrompt?: string;
}

export interface SkillExecutionResult {
  skill: SkillDefinition;
  processedContent: string;
  appliedVariables: Record<string, string>;
}

// Error types for skills system
export class SkillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillError';
  }
}

export class SkillParseError extends SkillError {
  constructor(skill: string, message: string) {
    super(`Failed to parse skill ${skill}: ${message}`);
    this.name = 'SkillParseError';
  }
}

export class SkillNotFoundError extends SkillError {
  constructor(skillName: string, availableSkills?: string[]) {
    const message = availableSkills?.length
      ? `Skill "${skillName}" not found. Available skills: ${availableSkills.join(', ')}`
      : `Skill "${skillName}" not found`;
    super(message);
    this.name = 'SkillNotFoundError';
  }
}

// Name validation regex from OpenCode spec
export const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_REGEX.test(name);
}
