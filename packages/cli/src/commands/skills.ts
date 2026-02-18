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
      case 'list':
        return await listCommand();
      case 'info':
        return await infoCommand(args.slice(1));
      case 'search':
        return await searchCommand(args.slice(1));
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
  console.log('  list                     Show available skills with OpenCode-style formatting');
  console.log('  info <skill>             Show detailed skill information including location');
  console.log('  search <query>           Search skills by name/tags/metadata');
  console.log('  status                   Show skill sources and discovery status');
  console.log('');
  console.log('Examples:');
  console.log('  cia skills list');
  console.log('  cia skills info git-release');
  console.log('  cia skills search "code review"');
  console.log('  cia skills status');
  console.log('');
  console.log('Skill discovery locations:');
  console.log('  ~/.cia/skills/           CIA-native global skills');
  console.log('  ~/.claude/skills/        OpenCode-compatible global skills');
  console.log('  .cia/skills/             Project-level CIA skills');
  console.log('  .claude/skills/          Project-level OpenCode skills');
}
