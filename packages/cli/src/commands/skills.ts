/**
 * Skills CLI commands with progressive disclosure
 * Following MCP command pattern with skills list, info, search, and status subcommands
 */

import { CIAConfig, loadStructuredConfig } from '../shared/config/loader.js';
import { SkillsManager } from '../skills/index.js';
import { CommonErrors, printError } from '../shared/errors/error-handling.js';
import { ExitCode } from '../utils/exit-codes.js';

// Global skills manager instance
let skillsManager: SkillsManager | null = null;

export async function skillsCommand(args: string[], config: CIAConfig): Promise<number> {
  const subcommand = args[0];

  if (!subcommand) {
    printSkillsUsage();
    return ExitCode.SUCCESS;
  }

  try {
    // Initialize skills manager if not already done
    if (!skillsManager) {
      skillsManager = new SkillsManager();
      const structuredConfig = loadStructuredConfig(config);
      await skillsManager.initialize(structuredConfig?.skills || {});
    }

    switch (subcommand.toLowerCase()) {
      case 'install':
        return await installCommand(args.slice(1));
      case 'uninstall':
        return await uninstallCommand(args.slice(1));
      case 'update':
        return await updateCommand(args.slice(1));
      case 'list':
        return await listCommand();
      case 'info':
        return await infoCommand(args.slice(1));
      case 'search':
        return await searchCommand(args.slice(1));
      case 'refresh':
        return await refreshCommand();
      case 'status':
        return await statusCommand();
      default: {
        const error = CommonErrors.unknownCommand(`skills ${subcommand}`);
        printError(error);
        return error.code;
      }
    }
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      'Skills command',
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function listCommand(): Promise<number> {
  try {
    if (!skillsManager) {
      console.log('Skills manager not initialized');
      return ExitCode.SUCCESS;
    }

    const skills = skillsManager.listSkills();

    if (skills.length === 0) {
      console.log('No skills available');
      console.log('Check skills status with: cia skills status');
      return ExitCode.SUCCESS;
    }

    // Output in OpenCode-style format
    console.log('<available_skills>');
    for (const skill of skills) {
      console.log('  <skill>');
      console.log(`    <name>${skill.name}</name>`);
      console.log(`    <description>${skill.description}</description>`);
      console.log(`    <location>file://${skill.location}</location>`);
      if (skill.metadata.compatibility) {
        console.log(`    <compatibility>${skill.metadata.compatibility}</compatibility>`);
      }
      console.log('  </skill>');
    }
    console.log('</available_skills>');
    console.log('');
    console.log(`Total skills: ${skills.length}`);

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      'list skills',
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function infoCommand(args: string[]): Promise<number> {
  const skillName = args[0];

  if (!skillName) {
    const error = CommonErrors.invalidArgument('skill name', 'a valid skill name');
    printError(error);
    return error.code;
  }

  try {
    if (!skillsManager) {
      console.log('Skills manager not initialized');
      return ExitCode.SUCCESS;
    }

    const skill = skillsManager.getSkill(skillName);

    if (!skill) {
      console.log(`Skill "${skillName}" not found`);
      const availableSkills = skillsManager.listSkills();
      if (availableSkills.length > 0) {
        console.log('Available skills:');
        for (const availableSkill of availableSkills.slice(0, 10)) {
          console.log(`  - ${availableSkill.name}`);
        }
        if (availableSkills.length > 10) {
          console.log(`  ... and ${availableSkills.length - 10} more`);
        }
      }
      return ExitCode.GENERAL_ERROR;
    }

    console.log(`Skill: ${skill.name}`);
    console.log('================');
    console.log(`Description: ${skill.description}`);
    console.log(`Source: ${skill.source}`);
    console.log(`Location: ${skill.location}`);
    console.log('');

    if (skill.metadata.license) {
      console.log(`License: ${skill.metadata.license}`);
    }

    if (skill.metadata.compatibility) {
      console.log(`Compatibility: ${skill.metadata.compatibility}`);
    }

    if (skill.metadata.metadata) {
      console.log('Metadata:');
      for (const [key, value] of Object.entries(skill.metadata.metadata)) {
        console.log(`  ${key}: ${value}`);
      }
    }

    if (skill.metadata.variables) {
      console.log('Variables:');
      for (const [name, variable] of Object.entries(skill.metadata.variables)) {
        console.log(
          `  {{${name}}} - ${variable.description}${variable.required ? ' (required)' : ''}`
        );
      }
    }

    console.log('');
    console.log('Content:');
    console.log('--------');
    console.log(skill.content);

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      `get skill info for ${skillName}`,
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function searchCommand(args: string[]): Promise<number> {
  const query = args.join(' ');

  if (!query) {
    const error = CommonErrors.invalidArgument('search query', 'a search term');
    printError(error);
    return error.code;
  }

  try {
    if (!skillsManager) {
      console.log('Skills manager not initialized');
      return ExitCode.SUCCESS;
    }

    const skills = skillsManager.searchSkills(query);

    if (skills.length === 0) {
      console.log(`No skills found matching "${query}"`);
      console.log('Use "cia skills list" to see all available skills');
      return ExitCode.SUCCESS;
    }

    console.log(`Search results for "${query}":`);
    console.log('================================');
    console.log(`Found ${skills.length} skills:`);
    console.log('');

    for (const skill of skills) {
      console.log(`${skill.name}: ${skill.description}`);
      console.log(`  Source: ${skill.source}`);
      if (skill.metadata.compatibility) {
        console.log(`  Compatibility: ${skill.metadata.compatibility}`);
      }
      console.log('');
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      `search skills for "${query}"`,
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function statusCommand(): Promise<number> {
  try {
    if (!skillsManager) {
      console.log('Skills manager not initialized');
      return ExitCode.SUCCESS;
    }

    const status = skillsManager.getStatusInfo();

    console.log('Skills System Status:');
    console.log('====================');
    console.log(`Initialized: ${status.initialized ? '✅ Yes' : '❌ No'}`);
    console.log(`Total skills: ${status.skillCount}`);
    console.log(`Sources: ${status.sourceCount}`);
    console.log('');

    if (status.sources.length === 0) {
      console.log('No skill sources configured or discovered');
      console.log('Skills will be discovered from standard directories:');
      console.log('  - ~/.cia/skills/');
      console.log('  - ~/.claude/skills/');
      console.log('  - ~/.agents/skills/');
      console.log('  - .cia/skills/');
      console.log('  - .claude/skills/');
      console.log('  - .agents/skills/');
      return ExitCode.SUCCESS;
    }

    console.log('Source Status:');
    for (const source of status.sources) {
      console.log(`${source.name} (${source.type}): ${formatSourceStatus(source.status)}`);
      console.log(`  Path: ${source.path}`);
      if (source.status.status === 'failed' && 'error' in source.status) {
        console.log(`  Error: ${source.status.error}`);
      }
      if (source.status.status === 'ready' && 'skillCount' in source.status) {
        console.log(`  Skills: ${source.status.skillCount}`);
      }
      console.log('');
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      'skills status check',
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

function formatSourceStatus(status: {
  status: string;
  skillCount?: number;
  error?: string;
}): string {
  const statusEmojis: Record<string, string> = {
    ready: '🟢 Ready',
    loading: '🟡 Loading...',
    failed: '❌ Failed',
    disabled: '⚪ Disabled',
  };

  return statusEmojis[status.status] || `❓ ${status.status}`;
}

function printSkillsUsage(): void {
  console.log('Usage: cia skills <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log(
    '  install <source>         Install skill from registry, GitHub repo, git URL, or local path'
  );
  console.log('  uninstall <name>         Remove installed skill');
  console.log('  update <name|all>        Update specific skill or all skills');
  console.log('  list                     Show available skills with OpenCode-style formatting');
  console.log('  info <skill>             Show detailed skill information including location');
  console.log('  search <query>           Search skills by name/tags/metadata');
  console.log('  refresh                  Reload skills from all sources');
  console.log('  status                   Show skill sources and discovery status');
  console.log('');
  console.log('Examples:');
  console.log('  cia skills install frontend-design              # from registry');
  console.log('  cia skills install anthropics/skills            # from GitHub repo');
  console.log('  cia skills install git@github.com:user/skill.git # from git URL');
  console.log('  cia skills install ./my-skill                   # from local path');
  console.log('  cia skills uninstall frontend-design');
  console.log('  cia skills update all');
  console.log('  cia skills list');
  console.log('  cia skills info git-release');
  console.log('  cia skills search "code review"');
  console.log('  cia skills refresh');
  console.log('  cia skills status');
  console.log('');
  console.log('Skill discovery locations:');
  console.log('  ~/.cia/skills/           CIA-native global skills');
  console.log('  ~/.claude/skills/        OpenCode-compatible global skills');
  console.log('  .cia/skills/             Project-level CIA skills');
  console.log('  .claude/skills/          Project-level OpenCode skills');
}

async function installCommand(args: string[]): Promise<number> {
  const source = args[0];

  if (!source) {
    const error = CommonErrors.invalidArgument(
      'source',
      'a skill name, GitHub repo, git URL, or local path'
    );
    printError(error);
    return error.code;
  }

  try {
    console.log(`Installing skill from: ${source}`);
    console.log('');

    // Determine source type following SkillCreator AI patterns
    const sourceType = determineSourceType(source);

    switch (sourceType) {
      case 'registry':
        console.log(`📦 Installing from skill registry: ${source}`);

        // Define a simple skill registry mapping
        const skillRegistry: Record<string, string> = {
          'frontend-design': 'opencode-ai/skills-frontend-design',
          'code-review': 'opencode-ai/skills-code-review',
          'debugging-expert': 'opencode-ai/skills-debugging-expert',
          'api-documentation': 'opencode-ai/skills-api-documentation',
          'testing-framework': 'opencode-ai/skills-testing-framework',
        };

        const githubRepo = skillRegistry[source];
        if (githubRepo) {
          console.log(`🎯 Found in registry, installing from GitHub: ${githubRepo}`);
          return await installFromGitHub(githubRepo, source);
        } else {
          console.log(`⚠️ Skill '${source}' not found in registry.`);
          console.log('');
          console.log('Available registry skills:');
          Object.keys(skillRegistry).forEach(skill => {
            console.log(`  - ${skill}`);
          });
          console.log('');
          console.log('You can also install from:');
          console.log('  - GitHub repo: cia skills install owner/repo');
          console.log('  - Git URL: cia skills install git@github.com:owner/repo.git');
          console.log('  - Local path: cia skills install ./my-skill');
        }
        break;

      case 'github':
        return await installFromGitHub(source);

      case 'git':
        return await installFromGit(source);

      case 'local':
        return await installFromLocal(source);
    }

    console.log('');
    console.log('Current skills can be discovered automatically from these locations:');
    console.log('  - ~/.cia/skills/         (CIA-native skills)');
    console.log('  - ~/.claude/skills/      (OpenCode-compatible skills)');
    console.log('  - ~/.agents/skills/      (Agent-compatible skills)');
    console.log('  - .cia/skills/           (Project skills)');
    console.log('');
    console.log('After adding skills manually, use "cia skills refresh" to reload.');

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      'install skill',
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function uninstallCommand(args: string[]): Promise<number> {
  const skillName = args[0];

  if (!skillName) {
    const error = CommonErrors.invalidArgument('skill name', 'a valid skill name');
    printError(error);
    return error.code;
  }

  try {
    if (!skillsManager) {
      console.log('Skills manager not initialized');
      return ExitCode.SUCCESS;
    }

    const skill = skillsManager.getSkill(skillName);
    if (!skill) {
      console.log(`Skill '${skillName}' not found.`);
      console.log('Use "cia skills list" to see available skills.');
      return ExitCode.SUCCESS;
    }

    console.log(`Uninstalling skill: ${skillName}`);
    console.log(`Location: ${skill.location}`);
    console.log('');
    console.log('Note: Automatic uninstall not yet implemented.');
    console.log('Manual removal:');
    console.log(`  1. Remove skill directory: rm -rf "${skill.location}"`);
    console.log(`  2. Refresh skills: cia skills refresh`);

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      `uninstall skill ${skillName}`,
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function updateCommand(args: string[]): Promise<number> {
  const skillName = args[0];

  if (!skillName) {
    const error = CommonErrors.invalidArgument('skill name', 'a valid skill name or "all"');
    printError(error);
    return error.code;
  }

  try {
    if (!skillsManager) {
      console.log('Skills manager not initialized');
      return ExitCode.SUCCESS;
    }

    if (skillName === 'all') {
      console.log('Updating all skills...');
      console.log('Note: Automatic update not yet implemented.');
      console.log('Manual update for Git-based skills:');
      console.log('  1. cd ~/.cia/skills/<skill-name>');
      console.log('  2. git pull origin main');
      console.log('  3. cia skills refresh');
    } else {
      const skill = skillsManager.getSkill(skillName);
      if (!skill) {
        console.log(`Skill '${skillName}' not found.`);
        console.log('Use "cia skills list" to see available skills.');
        return ExitCode.SUCCESS;
      }

      console.log(`Updating skill: ${skillName}`);
      console.log(`Location: ${skill.location}`);
      console.log('');
      console.log('Note: Automatic update not yet implemented.');
      console.log('Manual update for Git-based skills:');
      console.log(`  1. cd "${skill.location}"`);
      console.log('  2. git pull origin main');
      console.log('  3. cia skills refresh');
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      `update skill ${skillName}`,
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function refreshCommand(): Promise<number> {
  try {
    if (!skillsManager) {
      console.log('Skills manager not initialized');
      return ExitCode.SUCCESS;
    }

    console.log('🔄 Refreshing skills discovery...');
    await skillsManager.discoverSkills();

    const skills = skillsManager.listSkills();
    console.log(`✅ Discovery complete. Found ${skills.length} skills.`);

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      'refresh skills',
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

// Installation helper functions
async function installFromGitHub(repo: string, skillName?: string): Promise<number> {
  const { execSync } = await import('node:child_process');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const { existsSync, mkdirSync } = await import('node:fs');

  try {
    const skillsDir = join(homedir(), '.cia', 'skills');

    // Ensure skills directory exists
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    const repoName = skillName || repo.split('/').pop() || 'skill';
    const targetDir = join(skillsDir, repoName);

    console.log(`📂 Cloning to: ${targetDir}`);

    // Execute git clone
    execSync(`git clone https://github.com/${repo} "${targetDir}"`, {
      stdio: 'inherit',
    });

    console.log(`✅ Successfully installed skill: ${repoName}`);
    console.log(`📍 Location: ${targetDir}`);
    console.log('');
    console.log('Refreshing skills discovery...');

    // Refresh skills
    if (skillsManager) {
      await skillsManager.discoverSkills();
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    console.error(`❌ Failed to install from GitHub: ${error}`);
    console.log('Manual installation:');
    console.log(`  1. git clone https://github.com/${repo} ~/.cia/skills/${repo.split('/').pop()}`);
    console.log(`  2. cia skills refresh`);
    return ExitCode.LLM_EXECUTION;
  }
}

async function installFromGit(gitUrl: string): Promise<number> {
  const { execSync } = await import('node:child_process');
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const { existsSync, mkdirSync } = await import('node:fs');

  try {
    const skillsDir = join(homedir(), '.cia', 'skills');

    // Ensure skills directory exists
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    const repoName = gitUrl.split('/').pop()?.replace('.git', '') || 'skill';
    const targetDir = join(skillsDir, repoName);

    console.log(`📂 Cloning to: ${targetDir}`);

    // Execute git clone
    execSync(`git clone "${gitUrl}" "${targetDir}"`, {
      stdio: 'inherit',
    });

    console.log(`✅ Successfully installed skill: ${repoName}`);
    console.log(`📍 Location: ${targetDir}`);
    console.log('');
    console.log('Refreshing skills discovery...');

    // Refresh skills
    if (skillsManager) {
      await skillsManager.discoverSkills();
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    console.error(`❌ Failed to install from Git: ${error}`);
    console.log('Manual installation:');
    const repoName = gitUrl.split('/').pop()?.replace('.git', '') || 'skill';
    console.log(`  1. git clone ${gitUrl} ~/.cia/skills/${repoName}`);
    console.log(`  2. cia skills refresh`);
    return ExitCode.LLM_EXECUTION;
  }
}

async function installFromLocal(localPath: string): Promise<number> {
  const { homedir } = await import('node:os');
  const { join, resolve, basename } = await import('node:path');
  const { existsSync, mkdirSync, cpSync } = await import('node:fs');

  try {
    const skillsDir = join(homedir(), '.cia', 'skills');

    // Ensure skills directory exists
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    const sourcePath = resolve(localPath);
    if (!existsSync(sourcePath)) {
      console.error(`❌ Source path does not exist: ${sourcePath}`);
      return ExitCode.INPUT_VALIDATION;
    }

    const skillName = basename(sourcePath);
    const targetDir = join(skillsDir, skillName);

    console.log(`📁 Copying from: ${sourcePath}`);
    console.log(`📂 Installing to: ${targetDir}`);

    // Copy directory
    cpSync(sourcePath, targetDir, { recursive: true });

    console.log(`✅ Successfully installed skill: ${skillName}`);
    console.log(`📍 Location: ${targetDir}`);
    console.log('');
    console.log('Refreshing skills discovery...');

    // Refresh skills
    if (skillsManager) {
      await skillsManager.discoverSkills();
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    console.error(`❌ Failed to install from local path: ${error}`);
    console.log('Manual installation:');
    console.log(`  1. Copy skill directory to ~/.cia/skills/`);
    console.log(`  2. Ensure skill has valid SKILL.md file`);
    console.log(`  3. cia skills refresh`);
    return ExitCode.LLM_EXECUTION;
  }
}

function determineSourceType(source: string): 'registry' | 'github' | 'git' | 'local' {
  // Local path patterns
  if (source.startsWith('./') || source.startsWith('/') || source.startsWith('~/')) {
    return 'local';
  }

  // Git URL patterns (SSH and HTTPS)
  if (source.startsWith('git@') || (source.startsWith('https://') && source.includes('.git'))) {
    return 'git';
  }

  // GitHub repo pattern (owner/repo)
  if (source.includes('/') && !source.startsWith('http') && !source.includes('.')) {
    return 'github';
  }

  // Default to registry for simple names
  return 'registry';
}
