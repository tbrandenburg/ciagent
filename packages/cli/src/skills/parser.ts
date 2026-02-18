/**
 * SKILL.md Parser with YAML Frontmatter Support
 * Following OpenCode patterns with graceful error handling and fallback behavior
 */

import { parseDocument } from 'yaml';
import { readFile } from 'node:fs/promises';
import { SkillDefinition, SkillMetadata, isValidSkillName } from './types.js';

/**
 * Parse a SKILL.md file with YAML frontmatter
 * Follows OpenCode error handling pattern with graceful fallback
 * @param filePath Path to the SKILL.md file
 * @param source Source identifier (local, remote, etc.)
 * @returns SkillDefinition or null if parsing fails
 */
export async function parseSkillFile(
  filePath: string,
  source: string
): Promise<SkillDefinition | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return parseSkillContent(content, filePath, source);
  } catch (error) {
    console.error(`[Skills] Failed to read skill file ${filePath}:`, error);
    return null;
  }
}

/**
 * Parse skill content with YAML frontmatter
 * @param content Raw file content
 * @param filePath File path for error reporting
 * @param source Source identifier
 * @returns SkillDefinition or null if parsing fails
 */
export function parseSkillContent(
  content: string,
  filePath: string,
  source: string
): SkillDefinition | null {
  try {
    // Split frontmatter and content
    const parts = splitFrontmatter(content);
    if (!parts) {
      // No frontmatter, treat as plain markdown with minimal metadata
      return createFallbackSkill(content, filePath, source);
    }

    const { frontmatter, markdownContent } = parts;

    // Parse YAML frontmatter with error handling
    const metadata = parseYamlFrontmatter(frontmatter, filePath);
    if (!metadata) {
      return createFallbackSkill(content, filePath, source);
    }

    // Validate required fields
    if (!metadata.name || !metadata.description) {
      console.error(`[Skills] Missing required fields in ${filePath}: name or description`);
      return createFallbackSkill(content, filePath, source);
    }

    // Validate skill name format
    if (!isValidSkillName(metadata.name)) {
      console.error(
        `[Skills] Invalid skill name "${metadata.name}" in ${filePath}: must match pattern ^[a-z0-9]+(-[a-z0-9]+)*$`
      );
      return createFallbackSkill(content, filePath, source);
    }

    return {
      name: metadata.name,
      description: metadata.description,
      content: markdownContent.trim(),
      metadata,
      source,
      location: filePath,
    };
  } catch (error) {
    console.error(`[Skills] Failed to parse skill ${filePath}:`, error);
    return createFallbackSkill(content, filePath, source);
  }
}

/**
 * Split content into frontmatter and markdown sections
 * @param content Raw file content
 * @returns Object with frontmatter and content, or null if no frontmatter
 */
function splitFrontmatter(
  content: string
): { frontmatter: string; markdownContent: string } | null {
  // Check for YAML frontmatter delimiters
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  return {
    frontmatter: match[1],
    markdownContent: match[2] || '',
  };
}

/**
 * Parse YAML frontmatter with OpenCode error handling pattern
 * @param yamlContent YAML content string
 * @param filePath File path for error reporting
 * @returns SkillMetadata or null if parsing fails
 */
function parseYamlFrontmatter(yamlContent: string, filePath: string): SkillMetadata | null {
  try {
    const doc = parseDocument(yamlContent);

    if (doc.errors?.length) {
      console.error(`[Skills] YAML parsing warnings in ${filePath}:`, doc.errors);
    }

    const data = doc.toJS();

    if (!data || typeof data !== 'object') {
      console.error(`[Skills] Invalid YAML structure in ${filePath}`);
      return null;
    }

    // Extract and validate metadata fields
    const metadata: SkillMetadata = {
      name: data.name,
      description: data.description,
      license: data.license,
      compatibility: data.compatibility,
      metadata: data.metadata,
      variables: data.variables,
      examples: data.examples,
    };

    return metadata;
  } catch (error) {
    console.error(`[Skills] Failed to parse YAML frontmatter in ${filePath}:`, error);
    return null;
  }
}

/**
 * Create fallback skill from content when frontmatter parsing fails
 * Following OpenCode graceful degradation pattern
 * @param content Raw content
 * @param filePath File path
 * @param source Source identifier
 * @returns Basic SkillDefinition
 */
function createFallbackSkill(content: string, filePath: string, source: string): SkillDefinition {
  // Extract filename as skill name (without extension)
  const filename = filePath.split('/').pop()?.replace('.md', '') || 'unknown';
  const fallbackName = filename.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  console.error(`[Skills] Using fallback parsing for ${filePath}`);

  return {
    name: fallbackName,
    description: `Skill parsed from ${filename}`,
    content: content.trim(),
    metadata: {
      name: fallbackName,
      description: `Skill parsed from ${filename}`,
      compatibility: 'fallback',
    },
    source,
    location: filePath,
  };
}

/**
 * Validate skill definition completeness
 * @param skill SkillDefinition to validate
 * @returns true if valid, false otherwise
 */
export function validateSkillDefinition(skill: SkillDefinition): boolean {
  if (!skill.name || !skill.description) {
    return false;
  }

  if (!isValidSkillName(skill.name)) {
    return false;
  }

  if (skill.description.length < 1 || skill.description.length > 1024) {
    return false;
  }

  return true;
}

/**
 * Extract variables from skill content for template processing
 * @param content Skill content
 * @returns Array of variable names found in content
 */
export function extractVariables(content: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = variableRegex.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return variables;
}

/**
 * Process skill template with variable substitution
 * @param content Skill content with {{variable}} placeholders
 * @param variables Variable values to substitute
 * @returns Processed content with variables substituted
 */
export function processSkillTemplate(content: string, variables: Record<string, string>): string {
  let processedContent = content;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    processedContent = processedContent.replace(regex, value);
  });

  return processedContent;
}
