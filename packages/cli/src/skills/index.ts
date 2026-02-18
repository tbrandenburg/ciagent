/**
 * Skills System Public API
 * Export all public types and classes for external usage
 */

// Export the main SkillsManager class
export { SkillsManager } from './manager.js';
export type { SkillsManagerConfig } from './manager.js';

// Export the SkillsRegistry
export { SkillsRegistry } from './registry.js';

// Export core types and interfaces
export {
  type SkillDefinition,
  type SkillMetadata,
  type SkillVariable,
  type SkillExample,
  type SkillSourceStatus,
  type SkillSourceInfo,
  type SkillRegistry,
  type SkillDiscoveryOptions,
  type SkillTemplateContext,
  type SkillExecutionResult,
  SkillError,
  SkillParseError,
  SkillNotFoundError,
  SKILL_NAME_REGEX,
  isValidSkillName,
} from './types.js';

// Export parser functions
export {
  parseSkillFile,
  parseSkillContent,
  validateSkillDefinition,
  extractVariables,
  processSkillTemplate,
} from './parser.js';
