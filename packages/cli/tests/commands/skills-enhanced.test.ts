import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExitCode } from '../../src/utils/exit-codes.js';
import type { CIAConfig } from '../../src/shared/config/loader.js';

// Mock the SkillsManager
const mockSkillsManager = {
  initialize: vi.fn(),
  discoverSkills: vi.fn(),
  listSkills: vi.fn(),
  getSkill: vi.fn(),
  searchSkills: vi.fn(),
  getStatusInfo: vi.fn(),
  installFromSource: vi.fn(),
  uninstallSkill: vi.fn(),
  updateSkill: vi.fn(),
};

vi.mock('../../src/skills/index.js', () => ({
  SkillsManager: vi.fn(() => mockSkillsManager),
}));

// Import after mocking
const { skillsCommand } = await import('../../src/commands/skills.js');

// Mock console methods to capture output
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Skills Commands - Enhanced Tests', () => {
  const mockConfig = {
    provider: 'codex',
    mode: 'lazy',
    format: 'default',
    skills: {
      sources: [
        {
          name: 'cia-skills',
          type: 'local',
          path: '~/.cia/skills',
          enabled: true,
        },
        {
          name: 'opencode-skills',
          type: 'opencode',
          path: '~/.opencode/skills',
          enabled: true,
        },
      ],
    },
  } as unknown as CIAConfig;

  const mockSkills = [
    {
      name: 'frontend-design',
      description: 'Create modern frontend designs with best practices',
      content: 'Frontend design skill content...',
      source: 'cia-skills',
      location: '~/.cia/skills/frontend-design',
      metadata: {
        compatibility: 'OpenCode v1.0+',
        license: 'MIT',
        metadata: { author: 'CIA Team', version: '1.0.0' },
        variables: {
          framework: { description: 'Frontend framework to use', required: true },
          theme: { description: 'Theme configuration', required: false },
        },
      },
    },
    {
      name: 'git-release',
      description: 'Automated git release workflow with semantic versioning',
      content: 'Git release skill content...',
      source: 'opencode-skills',
      location: '~/.opencode/skills/git-release',
      metadata: {
        compatibility: 'Git 2.0+',
        license: 'Apache-2.0',
        metadata: { author: 'OpenCode Team' },
        variables: {},
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockSkillsManager.initialize.mockResolvedValue(undefined);
    mockSkillsManager.discoverSkills.mockResolvedValue(undefined);
    mockSkillsManager.listSkills.mockReturnValue(mockSkills);
    mockSkillsManager.getSkill.mockImplementation((name: string) =>
      mockSkills.find(skill => skill.name === name)
    );
    mockSkillsManager.searchSkills.mockImplementation((query: string) =>
      mockSkills.filter(
        skill =>
          skill.name.includes(query) ||
          skill.description.toLowerCase().includes(query.toLowerCase())
      )
    );
    mockSkillsManager.getStatusInfo.mockReturnValue({
      initialized: true,
      skillCount: mockSkills.length,
      sourceCount: 2,
      sources: [
        {
          name: 'cia-skills',
          type: 'local',
          path: '~/.cia/skills',
          status: { status: 'ready', skillCount: 1 },
        },
        {
          name: 'opencode-skills',
          type: 'opencode',
          path: '~/.opencode/skills',
          status: { status: 'ready', skillCount: 1 },
        },
      ],
    });
    mockSkillsManager.installFromSource.mockResolvedValue({
      success: true,
      skillName: 'test-skill',
    });
    mockSkillsManager.uninstallSkill.mockResolvedValue({ success: true });
    mockSkillsManager.updateSkill.mockResolvedValue({ success: true });
  });

  describe('Enhanced Skills Commands', () => {
    it('should handle list command with available skills', async () => {
      const result = await skillsCommand(['list'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockSkillsManager.initialize).toHaveBeenCalledWith(mockConfig.skills);
      expect(mockConsoleLog).toHaveBeenCalledWith('<available_skills>');
      expect(mockConsoleLog).toHaveBeenCalledWith('  <skill>');
      expect(mockConsoleLog).toHaveBeenCalledWith('    <name>frontend-design</name>');
      expect(mockConsoleLog).toHaveBeenCalledWith('    <name>git-release</name>');
      expect(mockConsoleLog).toHaveBeenCalledWith('</available_skills>');
      expect(mockConsoleLog).toHaveBeenCalledWith('Total skills: 2');
    });

    it('should handle list command with no skills', async () => {
      mockSkillsManager.listSkills.mockReturnValue([]);

      const result = await skillsCommand(['list'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('No skills available');
      expect(mockConsoleLog).toHaveBeenCalledWith('Check skills status with: cia skills status');
    });

    it('should handle info command for existing skill', async () => {
      const result = await skillsCommand(['info', 'frontend-design'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Skill: frontend-design');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Description: Create modern frontend designs with best practices'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('Source: cia-skills');
      expect(mockConsoleLog).toHaveBeenCalledWith('Location: ~/.cia/skills/frontend-design');
      expect(mockConsoleLog).toHaveBeenCalledWith('License: MIT');
      expect(mockConsoleLog).toHaveBeenCalledWith('Compatibility: OpenCode v1.0+');
    });

    it('should handle info command for non-existent skill', async () => {
      const result = await skillsCommand(['info', 'non-existent'], mockConfig);

      expect(result).toBe(ExitCode.GENERAL_ERROR);
      expect(mockConsoleLog).toHaveBeenCalledWith('Skill "non-existent" not found');
      expect(mockConsoleLog).toHaveBeenCalledWith('Available skills:');
      expect(mockConsoleLog).toHaveBeenCalledWith('  - frontend-design');
      expect(mockConsoleLog).toHaveBeenCalledWith('  - git-release');
    });

    it('should require skill name for info command', async () => {
      const result = await skillsCommand(['info'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: skill name')
      );
    });

    it('should handle search command with results', async () => {
      const result = await skillsCommand(['search', 'frontend'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Search results for "frontend":');
      expect(mockConsoleLog).toHaveBeenCalledWith('Found 1 skills:');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'frontend-design: Create modern frontend designs with best practices'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('  Source: cia-skills');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Compatibility: OpenCode v1.0+');
    });

    it('should handle search command with no results', async () => {
      mockSkillsManager.searchSkills.mockReturnValue([]);

      const result = await skillsCommand(['search', 'nonexistent'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('No skills found matching "nonexistent"');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Use "cia skills list" to see all available skills'
      );
    });

    it('should require search query for search command', async () => {
      const result = await skillsCommand(['search'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: search query')
      );
    });

    it('should handle status command', async () => {
      const result = await skillsCommand(['status'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Skills System Status:');
      expect(mockConsoleLog).toHaveBeenCalledWith('Initialized: ✅ Yes');
      expect(mockConsoleLog).toHaveBeenCalledWith('Total skills: 2');
      expect(mockConsoleLog).toHaveBeenCalledWith('Sources: 2');
      expect(mockConsoleLog).toHaveBeenCalledWith('Source Status:');
      expect(mockConsoleLog).toHaveBeenCalledWith('cia-skills (local): 🟢 Ready');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Skills: 1');
    });

    it('should handle status command with no sources', async () => {
      mockSkillsManager.getStatusInfo.mockReturnValue({
        initialized: true,
        skillCount: 0,
        sourceCount: 0,
        sources: [],
      });

      const result = await skillsCommand(['status'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('No skill sources configured or discovered');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Skills will be discovered from standard directories:'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('  - ~/.cia/skills/');
      expect(mockConsoleLog).toHaveBeenCalledWith('  - ~/.claude/skills/');
    });

    it('should handle refresh command', async () => {
      const result = await skillsCommand(['refresh'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockSkillsManager.discoverSkills).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Refreshing skills discovery...');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Discovery complete. Found 2 skills.');
    });
  });

  describe('Installation Commands', () => {
    it('should handle install command for registry skill', async () => {
      const result = await skillsCommand(['install', 'frontend-design'], mockConfig);

      expect(result).toBe(ExitCode.LLM_EXECUTION); // Git clone fails, shows manual instructions
      expect(mockConsoleLog).toHaveBeenCalledWith('Installing skill from: frontend-design');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '📦 Installing from skill registry: frontend-design'
      );
    });

    it('should handle install command for GitHub repo', async () => {
      const result = await skillsCommand(
        ['install', 'nonexistent-user/nonexistent-repo'],
        mockConfig
      );

      expect(result).toBe(ExitCode.LLM_EXECUTION); // Git clone fails, shows manual instructions
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Installing skill from: nonexistent-user/nonexistent-repo'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('Manual installation:');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('git clone https://github.com/nonexistent-user/nonexistent-repo')
      );
    });

    it('should handle install command for Git URL', async () => {
      const result = await skillsCommand(
        ['install', 'git@github.com:nonexistent-user/nonexistent-skill.git'],
        mockConfig
      );

      expect(result).toBe(ExitCode.LLM_EXECUTION); // Git clone fails, shows manual instructions
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Installing skill from: git@github.com:nonexistent-user/nonexistent-skill.git'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('Manual installation:');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('git clone git@github.com:nonexistent-user/nonexistent-skill.git')
      );
    });

    it('should handle install command for local path', async () => {
      const result = await skillsCommand(['install', './my-skill'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION); // Local path doesn't exist
      expect(mockConsoleLog).toHaveBeenCalledWith('Installing skill from: ./my-skill');
    });

    it('should require source for install command', async () => {
      const result = await skillsCommand(['install'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: source')
      );
    });

    it('should handle uninstall command for existing skill', async () => {
      const result = await skillsCommand(['uninstall', 'frontend-design'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Uninstalling skill: frontend-design');
      expect(mockConsoleLog).toHaveBeenCalledWith('Location: ~/.cia/skills/frontend-design');
      expect(mockConsoleLog).toHaveBeenCalledWith('Manual removal:');
    });

    it('should handle uninstall command for non-existent skill', async () => {
      const result = await skillsCommand(['uninstall', 'non-existent'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith("Skill 'non-existent' not found.");
      expect(mockConsoleLog).toHaveBeenCalledWith('Use "cia skills list" to see available skills.');
    });

    it('should require skill name for uninstall command', async () => {
      const result = await skillsCommand(['uninstall'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: skill name')
      );
    });

    it('should handle update command for specific skill', async () => {
      const result = await skillsCommand(['update', 'frontend-design'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Updating skill: frontend-design');
      expect(mockConsoleLog).toHaveBeenCalledWith('Location: ~/.cia/skills/frontend-design');
      expect(mockConsoleLog).toHaveBeenCalledWith('Manual update for Git-based skills:');
    });

    it('should handle update command for all skills', async () => {
      const result = await skillsCommand(['update', 'all'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Updating all skills...');
      expect(mockConsoleLog).toHaveBeenCalledWith('Manual update for Git-based skills:');
    });

    it('should handle update command for non-existent skill', async () => {
      const result = await skillsCommand(['update', 'non-existent'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith("Skill 'non-existent' not found.");
      expect(mockConsoleLog).toHaveBeenCalledWith('Use "cia skills list" to see available skills.');
    });

    it('should require skill name for update command', async () => {
      const result = await skillsCommand(['update'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid argument: skill name')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown subcommand errors', async () => {
      const result = await skillsCommand(['invalid-subcommand'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Error: Unknown command: skills invalid-subcommand')
      );
    });

    it('should handle unknown subcommands gracefully', async () => {
      const result = await skillsCommand(['invalid-command'], mockConfig);

      expect(result).toBe(ExitCode.INPUT_VALIDATION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Unknown command: skills invalid-command')
      );
    });

    it('should handle skill discovery errors', async () => {
      mockSkillsManager.discoverSkills.mockRejectedValue(new Error('Discovery failed'));

      const result = await skillsCommand(['refresh'], mockConfig);

      expect(result).toBe(ExitCode.LLM_EXECUTION);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Operation failed: refresh skills')
      );
    });

    it('should handle installation errors', async () => {
      mockSkillsManager.installFromSource.mockResolvedValue({
        success: false,
        error: 'Installation failed',
      });

      const result = await skillsCommand(['install', 'test-skill'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Installing skill from: test-skill');
    });
  });

  describe('Usage Information', () => {
    it('should display usage information when no subcommand provided', async () => {
      const result = await skillsCommand([], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: cia skills <command> [options]');
      expect(mockConsoleLog).toHaveBeenCalledWith('Commands:');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('install <source>'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('list'));
      expect(mockConsoleLog).toHaveBeenCalledWith('Examples:');
      expect(mockConsoleLog).toHaveBeenCalledWith('Skill discovery locations:');
    });
  });

  describe('Integration Tests', () => {
    it('should complete full skills management workflow', async () => {
      // Test the complete workflow: install -> list -> info -> search -> refresh -> update -> uninstall

      // Step 1: Install a skill
      let result = await skillsCommand(['install', 'test-skill'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Installing skill from: test-skill');

      // Clear mocks to check subsequent calls
      vi.clearAllMocks();
      mockSkillsManager.listSkills.mockReturnValue(mockSkills);
      mockSkillsManager.getSkill.mockImplementation((name: string) =>
        mockSkills.find(skill => skill.name === name)
      );

      // Step 2: List skills
      result = await skillsCommand(['list'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('<available_skills>');

      // Step 3: Get specific skill info
      result = await skillsCommand(['info', 'frontend-design'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Skill: frontend-design');

      // Step 4: Search skills
      mockSkillsManager.searchSkills.mockReturnValue([mockSkills[0]]);
      result = await skillsCommand(['search', 'design'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Search results for "design":');

      // Step 5: Refresh skills
      result = await skillsCommand(['refresh'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Refreshing skills discovery...');

      // Step 6: Update skill
      result = await skillsCommand(['update', 'frontend-design'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Updating skill: frontend-design');

      // Step 7: Check status
      mockSkillsManager.getStatusInfo.mockReturnValue({
        initialized: true,
        skillCount: mockSkills.length,
        sourceCount: 2,
        sources: [],
      });
      result = await skillsCommand(['status'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Skills System Status:');

      // Step 8: Uninstall skill
      result = await skillsCommand(['uninstall', 'frontend-design'], mockConfig);
      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Uninstalling skill: frontend-design');

      // Verify workflow completed successfully
      expect(result).toBe(ExitCode.SUCCESS);
    });

    it('should handle mixed skill source types', async () => {
      // Mock skills from different source types
      mockSkillsManager.getStatusInfo.mockReturnValue({
        initialized: true,
        skillCount: 3,
        sourceCount: 3,
        sources: [
          {
            name: 'cia-local',
            type: 'local',
            path: '~/.cia/skills',
            status: { status: 'ready', skillCount: 1 },
          },
          {
            name: 'opencode-global',
            type: 'opencode',
            path: '~/.opencode/skills',
            status: { status: 'ready', skillCount: 1 },
          },
          {
            name: 'project-skills',
            type: 'local',
            path: './.cia/skills',
            status: { status: 'failed', error: 'Directory not accessible' },
          },
        ],
      });

      const result = await skillsCommand(['status'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Total skills: 3');
      expect(mockConsoleLog).toHaveBeenCalledWith('Sources: 3');
      expect(mockConsoleLog).toHaveBeenCalledWith('cia-local (local): 🟢 Ready');
      expect(mockConsoleLog).toHaveBeenCalledWith('project-skills (local): ❌ Failed');
      expect(mockConsoleLog).toHaveBeenCalledWith('  Error: Directory not accessible');
    });

    it('should handle skills with complex metadata', async () => {
      const result = await skillsCommand(['info', 'frontend-design'], mockConfig);

      expect(result).toBe(ExitCode.SUCCESS);
      expect(mockConsoleLog).toHaveBeenCalledWith('Metadata:');
      expect(mockConsoleLog).toHaveBeenCalledWith('  author: CIA Team');
      expect(mockConsoleLog).toHaveBeenCalledWith('  version: 1.0.0');
      expect(mockConsoleLog).toHaveBeenCalledWith('Variables:');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '  {{framework}} - Frontend framework to use (required)'
      );
      expect(mockConsoleLog).toHaveBeenCalledWith('  {{theme}} - Theme configuration');
    });
  });
});
