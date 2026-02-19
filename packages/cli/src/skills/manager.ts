/**
 * SkillsManager - Core skills discovery and management
 * Follows MCPManager pattern with multi-source discovery and error isolation
 */

import { readdir, stat, mkdir, rm, readFile, access } from 'node:fs/promises';
import { join, resolve, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
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
   * Install skill from various source types (SkillCreator AI pattern)
   */
  async installFromSource(
    source: string,
    options: { force?: boolean } = {}
  ): Promise<{
    success: boolean;
    skillName?: string;
    error?: string;
  }> {
    console.log(`[Skills] Installing skill from source: ${source}`);

    try {
      // Determine source type and route to appropriate installer
      if (this.isGitHubRepo(source)) {
        return await this.installFromGitHub(source, options);
      } else if (this.isGitUrl(source)) {
        return await this.installFromGit(source, options);
      } else if (this.isLocalPath(source)) {
        return await this.installFromLocal(source, options);
      } else {
        // Assume it's a registry skill name
        return await this.installFromRegistry(source, options);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Skills] Installation failed for ${source}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Install skill from GitHub repository (owner/repo or owner/repo/subpath)
   */
  async installFromGitHub(
    repo: string,
    options: { force?: boolean } = {}
  ): Promise<{
    success: boolean;
    skillName?: string;
    error?: string;
  }> {
    const gitUrl = `https://github.com/${repo}.git`;
    return await this.installFromGit(gitUrl, options);
  }

  /**
   * Install skill from Git URL
   */
  async installFromGit(
    gitUrl: string,
    options: { force?: boolean } = {}
  ): Promise<{
    success: boolean;
    skillName?: string;
    error?: string;
  }> {
    const skillName = this.extractSkillNameFromGitUrl(gitUrl);
    const installDir = this.getSkillInstallPath(skillName);

    try {
      // Check if skill already exists
      if (!options.force) {
        try {
          await access(installDir);
          return {
            success: false,
            error: `Skill '${skillName}' already exists. Use --force to overwrite.`,
          };
        } catch {
          // Directory doesn't exist, proceed with installation
        }
      }

      // Ensure parent directory exists
      await mkdir(dirname(installDir), { recursive: true });

      // Clone or update the repository
      if (options.force) {
        try {
          await rm(installDir, { recursive: true, force: true });
        } catch {
          // Directory may not exist, continue
        }
      }

      console.log(`[Skills] Cloning ${gitUrl} to ${installDir}...`);
      execSync(`git clone --quiet "${gitUrl}" "${installDir}"`, { stdio: 'pipe' });

      // Verify the skill was installed correctly
      const isValid = await this.validateSkillInstallation(installDir);
      if (!isValid) {
        await rm(installDir, { recursive: true, force: true });
        return { success: false, error: `Invalid skill structure in ${gitUrl}` };
      }

      // Refresh skills discovery to include new skill
      await this.discoverSkills();

      console.log(`[Skills] Successfully installed skill '${skillName}' from ${gitUrl}`);
      return { success: true, skillName };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Clean up on failure
      try {
        await rm(installDir, { recursive: true, force: true });
      } catch {
        // Cleanup may fail, but that's okay
      }
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Install skill from local filesystem path
   */
  async installFromLocal(
    sourcePath: string,
    options: { force?: boolean } = {}
  ): Promise<{
    success: boolean;
    skillName?: string;
    error?: string;
  }> {
    const resolvedPath = resolve(sourcePath);

    try {
      // Verify source exists and is valid
      const isValid = await this.validateSkillInstallation(resolvedPath);
      if (!isValid) {
        return { success: false, error: `Invalid skill structure at ${resolvedPath}` };
      }

      const skillName = basename(resolvedPath);
      const installDir = this.getSkillInstallPath(skillName);

      // Check if skill already exists
      if (!options.force) {
        try {
          await access(installDir);
          return {
            success: false,
            error: `Skill '${skillName}' already exists. Use --force to overwrite.`,
          };
        } catch {
          // Directory doesn't exist, proceed with installation
        }
      }

      // Copy skill to install location
      await mkdir(dirname(installDir), { recursive: true });

      if (options.force) {
        try {
          await rm(installDir, { recursive: true, force: true });
        } catch {
          // Directory may not exist, continue
        }
      }

      // Copy the skill directory
      console.log(`[Skills] Copying skill from ${resolvedPath} to ${installDir}...`);
      execSync(`cp -r "${resolvedPath}" "${installDir}"`, { stdio: 'pipe' });

      // Refresh skills discovery to include new skill
      await this.discoverSkills();

      console.log(`[Skills] Successfully installed skill '${skillName}' from ${resolvedPath}`);
      return { success: true, skillName };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Install skill from registry by name
   */
  async installFromRegistry(
    skillName: string,
    _options: { force?: boolean } = {}
  ): Promise<{
    success: boolean;
    skillName?: string;
    error?: string;
  }> {
    // This would connect to a skills registry in the future
    // For now, return not implemented
    return {
      success: false,
      error: `Registry installation not yet implemented for skill '${skillName}'. Use GitHub repo, git URL, or local path.`,
    };
  }

  /**
   * Uninstall a skill
   */
  async uninstallSkill(skillName: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const installDir = this.getSkillInstallPath(skillName);

    try {
      // Check if skill exists
      try {
        await access(installDir);
      } catch {
        return { success: false, error: `Skill '${skillName}' is not installed.` };
      }

      // Remove skill directory
      console.log(`[Skills] Removing skill '${skillName}' from ${installDir}...`);
      await rm(installDir, { recursive: true, force: true });

      // Refresh skills discovery to remove from registry
      await this.discoverSkills();

      console.log(`[Skills] Successfully uninstalled skill '${skillName}'`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Update an installed skill
   */
  async updateSkill(skillName: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const installDir = this.getSkillInstallPath(skillName);

    try {
      // Check if skill exists
      try {
        await access(installDir);
      } catch {
        return { success: false, error: `Skill '${skillName}' is not installed.` };
      }

      // Check if it's a git repository
      try {
        await access(join(installDir, '.git'));
      } catch {
        return {
          success: false,
          error: `Skill '${skillName}' is not a git repository and cannot be updated.`,
        };
      }

      // Pull latest changes
      console.log(`[Skills] Updating skill '${skillName}' in ${installDir}...`);
      execSync('git pull --quiet', { cwd: installDir, stdio: 'pipe' });

      // Refresh skills discovery to update registry
      await this.discoverSkills();

      console.log(`[Skills] Successfully updated skill '${skillName}'`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Validate skill installation structure
   */
  private async validateSkillInstallation(skillPath: string): Promise<boolean> {
    try {
      // Check if SKILL.md exists
      const skillFilePath = join(skillPath, 'SKILL.md');
      await access(skillFilePath);

      // Try to parse the skill file to ensure it's valid
      const skillContent = await readFile(skillFilePath, 'utf-8');
      const skill = parseSkillFile(skillContent, skillFilePath);

      return !!skill;
    } catch {
      return false;
    }
  }

  /**
   * Get installation path for a skill
   */
  private getSkillInstallPath(skillName: string): string {
    // Install to ~/.cia/skills/ directory
    return join(homedir(), '.cia', 'skills', skillName);
  }

  /**
   * Check if source is a GitHub repo (owner/repo format)
   */
  private isGitHubRepo(source: string): boolean {
    return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/.*)?$/.test(source) && !source.includes('.');
  }

  /**
   * Check if source is a Git URL
   */
  private isGitUrl(source: string): boolean {
    return (
      source.startsWith('git@') ||
      source.startsWith('https://github.com/') ||
      source.startsWith('http://github.com/') ||
      source.endsWith('.git')
    );
  }

  /**
   * Check if source is a local filesystem path
   */
  private isLocalPath(source: string): boolean {
    return (
      source.startsWith('./') ||
      source.startsWith('../') ||
      source.startsWith('/') ||
      source.startsWith('~')
    );
  }

  /**
   * Extract skill name from Git URL
   */
  private extractSkillNameFromGitUrl(gitUrl: string): string {
    const match = gitUrl.match(/\/([^\/]+?)(?:\.git)?$/);
    return match ? match[1] : 'unknown-skill';
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Currently no persistent connections to clean up
    // Future enhancement might include HTTP clients for remote sources
  }
}
