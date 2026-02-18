/**
 * SkillsManager - Core skills discovery and management
 * Follows MCPManager pattern with multi-source discovery and error isolation
 */

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { SkillsRegistry } from './registry.js';
import { parseSkillFile } from './parser.js';
import { SkillDefinition, SkillSourceInfo, SkillDiscoveryOptions } from './types.js';

export interface SkillsManagerConfig {
  sources?: Array<{
    name: string;
    type: 'local' | 'remote' | 'opencode';
    path: string;
    enabled?: boolean;
    refreshInterval?: number;
  }>;
  // OpenCode compatibility fields
  paths?: string[]; // Additional paths to skill folders
  urls?: string[]; // URLs to fetch skills from
}

export class SkillsManager {
  private registry: SkillsRegistry = new SkillsRegistry();
  private config: SkillsManagerConfig = {};
  private initialized = false;

  // CIA-native and OpenCode-compatible directories
  private readonly EXTERNAL_DIRS = ['.cia', '.claude', '.agents', '.opencode'];
  private readonly SKILL_PATTERN = 'SKILL.md';

  constructor() {
    // Handle cleanup on process exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  /**
   * Initialize SkillsManager with configuration
   * Following MCPManager initialization pattern
   */
  async initialize(config: SkillsManagerConfig = {}): Promise<void> {
    this.config = config;

    console.log(`[Skills] Initializing skills discovery...`);

    // Discover skills from all sources
    await this.discoverSkills();

    const stats = this.registry.getStats();
    console.log(
      `[Skills] Initialized with ${stats.skillCount} skills from ${stats.sourceCount} sources`
    );

    this.initialized = true;
  }

  /**
   * Discover skills from all configured sources
   * Following OpenCode multi-source discovery pattern
   */
  async discoverSkills(): Promise<void> {
    console.log(`[Skills] Starting skill discovery...`);

    // Clear existing skills to refresh
    this.registry.clearSkills();
    this.registry.clearSources();

    // Discover from standard directories (global first, then project-level)
    await this.discoverFromStandardDirectories();

    // Discover from configured sources
    if (this.config.sources) {
      for (const sourceConfig of this.config.sources) {
        if (sourceConfig.enabled !== false) {
          await this.discoverFromSource(sourceConfig);
        }
      }
    }

    // Discover from configured paths (OpenCode compatibility)
    if (this.config.paths) {
      for (const path of this.config.paths) {
        await this.discoverFromPath(path, 'configured-path');
      }
    }

    // Note: URL discovery (this.config.urls) would be implemented in future enhancement
    if (this.config.urls?.length) {
      console.log(
        `[Skills] URL discovery not yet implemented, ${this.config.urls.length} URLs skipped`
      );
    }
  }

  /**
   * Discover skills from standard CIA-native and OpenCode-compatible directories
   * Following OpenCode hierarchy: global first, then project-level (project overrides global)
   */
  private async discoverFromStandardDirectories(): Promise<void> {
    // 1. Global CIA-native and OpenCode directories
    const homePath = homedir();

    for (const dir of this.EXTERNAL_DIRS) {
      // Home directory
      const homeSkillsPath = join(homePath, dir, 'skills');
      await this.scanSkillsDirectory(homeSkillsPath, dir);

      // XDG config directory for CIA
      if (dir === '.cia') {
        const xdgConfigPath = join(homePath, '.config', 'cia', 'skills');
        await this.scanSkillsDirectory(xdgConfigPath, 'xdg-cia');
      }

      // XDG config directory for OpenCode
      if (dir === '.opencode') {
        const xdgConfigPath = join(homePath, '.config', 'opencode', 'skills');
        await this.scanSkillsDirectory(xdgConfigPath, 'xdg-opencode');
      }
    }

    // 2. Project-level directories (these override global ones)
    const currentDir = process.cwd();

    for (const dir of this.EXTERNAL_DIRS) {
      const projectSkillsPath = join(currentDir, dir, 'skills');
      await this.scanSkillsDirectory(projectSkillsPath, dir);
    }
  }

  /**
   * Discover skills from a configured source
   */
  private async discoverFromSource(sourceConfig: {
    name: string;
    type: 'local' | 'remote' | 'opencode';
    path: string;
    enabled?: boolean;
    refreshInterval?: number;
  }): Promise<void> {
    const sourceInfo: SkillSourceInfo = {
      name: sourceConfig.name,
      type: sourceConfig.type,
      path: sourceConfig.path,
      status: { status: 'loading' },
    };

    this.registry.registerSource(sourceInfo);

    try {
      await this.discoverFromPath(sourceConfig.path, sourceConfig.name);

      // Update source status
      const stats = this.registry.getStats();
      const skillCount = stats.sourceStats[sourceConfig.name] || 0;
      sourceInfo.status = { status: 'ready', skillCount };
      this.registry.registerSource(sourceInfo);
    } catch (error) {
      console.error(`[Skills] Failed to discover from source ${sourceConfig.name}:`, error);
      sourceInfo.status = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
      this.registry.registerSource(sourceInfo);
    }
  }

  /**
   * Discover skills from a specific path
   */
  private async discoverFromPath(path: string, sourceName: string): Promise<void> {
    const resolvedPath = resolve(path);
    await this.scanSkillsDirectory(resolvedPath, sourceName);
  }

  /**
   * Scan a directory for SKILL.md files
   * Following OpenCode directory traversal pattern
   */
  private async scanSkillsDirectory(skillsPath: string, sourceName: string): Promise<void> {
    try {
      const dirStats = await stat(skillsPath);
      if (!dirStats.isDirectory()) {
        return;
      }

      const entries = await readdir(skillsPath);

      for (const entry of entries) {
        const skillDir = join(skillsPath, entry);

        try {
          const entryStats = await stat(skillDir);
          if (!entryStats.isDirectory()) {
            continue;
          }

          // Look for SKILL.md in the skill directory
          const skillFile = join(skillDir, this.SKILL_PATTERN);

          try {
            const skillStats = await stat(skillFile);
            if (skillStats.isFile()) {
              await this.loadSkillFile(skillFile, sourceName);
            }
          } catch {
            // SKILL.md not found in this directory, continue
          }
        } catch (error) {
          console.error(`[Skills] Failed to process entry ${entry} in ${skillsPath}:`, error);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be accessed - this is normal
      // Don't log as error since many directories won't exist
    }
  }

  /**
   * Load and register a single skill file
   * With OpenCode error isolation pattern
   */
  private async loadSkillFile(skillFilePath: string, sourceName: string): Promise<void> {
    try {
      const skill = await parseSkillFile(skillFilePath, sourceName);

      if (skill) {
        const success = this.registry.registerSkill(skill);
        if (success) {
          console.log(`[Skills] Loaded skill: ${skill.name} from ${sourceName}`);
        } else {
          // Registry will have logged the duplicate warning
        }
      }
    } catch (error) {
      console.error(`[Skills] Failed to load skill ${skillFilePath}:`, error);
    }
  }

  /**
   * Get a skill by name
   */
  getSkill(name: string): SkillDefinition | undefined {
    return this.registry.getSkill(name);
  }

  /**
   * List all available skills
   */
  listSkills(options: SkillDiscoveryOptions = {}): SkillDefinition[] {
    return this.registry.filterSkills(options);
  }

  /**
   * Search skills by query
   */
  searchSkills(query: string): SkillDefinition[] {
    return this.registry.searchSkills(query);
  }

  /**
   * Get skills manager status information
   */
  getStatusInfo(): {
    initialized: boolean;
    skillCount: number;
    sourceCount: number;
    sources: SkillSourceInfo[];
  } {
    const stats = this.registry.getStats();
    return {
      initialized: this.initialized,
      skillCount: stats.skillCount,
      sourceCount: stats.sourceCount,
      sources: this.registry.getAllSources(),
    };
  }

  /**
   * Process skill template with variables
   */
  processSkillTemplate(skillName: string, variables: Record<string, string>): string {
    const skill = this.registry.getRequiredSkill(skillName);

    // Simple template variable substitution
    let processedContent = skill.content;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processedContent = processedContent.replace(regex, value);
    });

    return processedContent;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Currently no persistent connections to clean up
    // Future enhancement might include HTTP clients for remote sources
  }
}
