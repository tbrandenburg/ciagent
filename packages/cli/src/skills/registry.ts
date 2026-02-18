/**
 * Skills Registry for skill management
 * Follows ToolRegistry pattern with Map-based storage and validation
 */

import {
  SkillDefinition,
  SkillSourceInfo,
  SkillDiscoveryOptions,
  SkillNotFoundError,
} from './types.js';
import { validateSkillDefinition } from './parser.js';

export class SkillsRegistry {
  private skills: Map<string, SkillDefinition>;
  private sources: Map<string, SkillSourceInfo>;

  constructor() {
    this.skills = new Map();
    this.sources = new Map();
  }

  /**
   * Register a new skill in the registry
   * @param skill SkillDefinition to register
   * @returns true if successfully registered, false if skill already exists
   */
  registerSkill(skill: SkillDefinition): boolean {
    // Validate skill definition
    if (!validateSkillDefinition(skill)) {
      console.error(`[Skills] Invalid skill definition for ${skill.name}`);
      return false;
    }

    if (this.skills.has(skill.name)) {
      console.error(
        `[Skills] Duplicate skill name: ${skill.name} (existing: ${this.skills.get(skill.name)?.location}, new: ${skill.location})`
      );
      return false;
    }

    this.skills.set(skill.name, { ...skill });
    return true;
  }

  /**
   * Retrieve a skill by name
   * @param name Skill name to retrieve
   * @returns SkillDefinition if found, undefined otherwise
   */
  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /**
   * Retrieve a skill by name with error throwing
   * @param name Skill name to retrieve
   * @returns SkillDefinition
   * @throws SkillNotFoundError if skill doesn't exist
   */
  getRequiredSkill(name: string): SkillDefinition {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new SkillNotFoundError(name, this.listSkills());
    }
    return skill;
  }

  /**
   * List all registered skills
   * @returns Array of skill names
   */
  listSkills(): string[] {
    return Array.from(this.skills.keys()).sort();
  }

  /**
   * List all registered skill definitions
   * @returns Array of SkillDefinition objects
   */
  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Search skills by query (name, description, metadata)
   * @param query Search query string
   * @returns Array of matching SkillDefinition objects
   */
  searchSkills(query: string): SkillDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllSkills().filter(
      skill =>
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        (skill.metadata.metadata &&
          Object.values(skill.metadata.metadata).some(value =>
            value.toLowerCase().includes(lowerQuery)
          ))
    );
  }

  /**
   * Filter skills by options
   * @param options SkillDiscoveryOptions for filtering
   * @returns Array of matching SkillDefinition objects
   */
  filterSkills(options: SkillDiscoveryOptions = {}): SkillDefinition[] {
    let skills = this.getAllSkills();

    if (options.sourceType && options.sourceType !== 'all') {
      skills = skills.filter(skill => {
        const sourceInfo = this.sources.get(skill.source);
        return sourceInfo?.type === options.sourceType;
      });
    }

    return skills;
  }

  /**
   * Register a skill source
   * @param source SkillSourceInfo to register
   */
  registerSource(source: SkillSourceInfo): void {
    this.sources.set(source.name, { ...source });
  }

  /**
   * Get source information
   * @param name Source name
   * @returns SkillSourceInfo if found, undefined otherwise
   */
  getSource(name: string): SkillSourceInfo | undefined {
    return this.sources.get(name);
  }

  /**
   * List all registered sources
   * @returns Array of SkillSourceInfo objects
   */
  getAllSources(): SkillSourceInfo[] {
    return Array.from(this.sources.values());
  }

  /**
   * Remove a skill from the registry
   * @param name Skill name to remove
   * @returns true if removed, false if not found
   */
  removeSkill(name: string): boolean {
    return this.skills.delete(name);
  }

  /**
   * Clear all skills from the registry
   */
  clearSkills(): void {
    this.skills.clear();
  }

  /**
   * Clear all sources from the registry
   */
  clearSources(): void {
    this.sources.clear();
  }

  /**
   * Get registry statistics
   * @returns Object with skill and source counts
   */
  getStats(): { skillCount: number; sourceCount: number; sourceStats: Record<string, number> } {
    const sourceStats: Record<string, number> = {};

    for (const skill of this.skills.values()) {
      sourceStats[skill.source] = (sourceStats[skill.source] || 0) + 1;
    }

    return {
      skillCount: this.skills.size,
      sourceCount: this.sources.size,
      sourceStats,
    };
  }

  /**
   * Check if registry has any skills
   * @returns true if registry contains skills, false otherwise
   */
  hasSkills(): boolean {
    return this.skills.size > 0;
  }

  /**
   * Validate all registered skills
   * @returns Array of validation errors
   */
  validateAllSkills(): string[] {
    const errors: string[] = [];

    for (const [name, skill] of this.skills.entries()) {
      if (!validateSkillDefinition(skill)) {
        errors.push(`Invalid skill definition: ${name}`);
      }
    }

    return errors;
  }
}
