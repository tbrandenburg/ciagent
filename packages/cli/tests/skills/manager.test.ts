import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { join } from 'node:path';
import { SkillsManager } from '../../src/skills/manager.js';
import { SkillDefinition } from '../../src/skills/types.js';

// Mock file system operations for deterministic tests
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

// Get mocked functions after mocking
import { readdir, stat, readFile } from 'node:fs/promises';
const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockReadFile = vi.mocked(readFile);

describe('SkillsManager', () => {
  let skillsManager: SkillsManager;

  beforeEach(() => {
    skillsManager = new SkillsManager();
    vi.clearAllMocks();

    // Default mock setup: all directories don't exist by default
    mockStat.mockRejectedValue(new Error('ENOENT: no such file or directory'));
    mockReaddir.mockRejectedValue(new Error('ENOENT: no such file or directory'));
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));
  });

  // Helper function to set up skill mocking
  const setupSkillMocks = (
    skillConfigs: Array<{ path: string; skills: Array<{ name: string; content: string }> }>
  ) => {
    mockStat.mockReset();
    mockReaddir.mockReset();
    mockReadFile.mockReset();

    // Default rejections
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockRejectedValue(new Error('ENOENT'));
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    // Set up each configured skills path
    for (const config of skillConfigs) {
      // The skills directory exists
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any);

      // The skills directory contains skill folders
      mockReaddir.mockResolvedValueOnce(config.skills.map(s => s.name) as any);

      // Each skill directory exists and contains SKILL.md
      for (const skill of config.skills) {
        mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any); // skill directory exists
        mockStat.mockResolvedValueOnce({ isFile: () => true } as any); // SKILL.md file exists
        mockReadFile.mockResolvedValueOnce(skill.content); // SKILL.md content
      }
    }
  };

  afterEach(() => {
    // Cleanup any initialized skills manager
    if (skillsManager) {
      skillsManager.cleanup();
    }
  });

  describe('Initialization', () => {
    it('should initialize with empty configuration', async () => {
      // Mock empty directory discovery
      mockReaddir.mockResolvedValue([]);
      mockStat.mockResolvedValue({ isDirectory: () => false } as any);

      await expect(skillsManager.initialize()).resolves.not.toThrow();
      expect(skillsManager.getStatusInfo().skillCount).toBe(0);
    });

    it('should initialize with sources configuration', async () => {
      const config = {
        sources: [
          {
            name: 'test-source',
            type: 'local' as const,
            path: '/test/skills',
            enabled: true,
          },
        ],
      };

      // Mock directory structure
      mockReaddir.mockResolvedValue([]);
      mockStat.mockResolvedValue({ isDirectory: () => false } as any);

      await expect(skillsManager.initialize(config)).resolves.not.toThrow();
    });

    it('should handle initialization errors gracefully', async () => {
      const config = {
        sources: [
          {
            name: 'error-source',
            type: 'local' as const,
            path: '/nonexistent/path',
          },
        ],
      };

      // Mock file system error
      mockReaddir.mockRejectedValue(new Error('Directory not found'));

      await expect(skillsManager.initialize(config)).resolves.not.toThrow();
      expect(skillsManager.getStatusInfo().skillCount).toBe(0);
    });
  });

  describe('Skills Discovery', () => {
    it('should discover skills in configured directories', async () => {
      const config = {
        sources: [
          {
            name: 'local-skills',
            type: 'local' as const,
            path: '/test/skills',
            enabled: true,
          },
        ],
      };

      const skillContent = `---
name: test-skill-1
description: A test skill
version: 1.0.0
---

# Test Skill

This is a test skill for unit testing.
`;

      setupSkillMocks([
        {
          path: '/test/skills',
          skills: [
            { name: 'skill1', content: skillContent },
            { name: 'skill2', content: skillContent.replace('test-skill-1', 'test-skill-2') },
          ],
        },
      ]);

      await skillsManager.initialize(config);

      expect(skillsManager.listSkills().length).toBeGreaterThan(0);
    });

    it('should handle skills with missing SKILL.md files', async () => {
      const config = {
        sources: [
          {
            name: 'incomplete-skills',
            type: 'local' as const,
            path: '/test/skills',
          },
        ],
      };

      // Mock directory with no SKILL.md files
      mockReaddir.mockResolvedValueOnce(['empty-skill'] as any).mockResolvedValueOnce([] as any);

      mockStat.mockResolvedValue({ isDirectory: () => true } as any);

      await skillsManager.initialize(config);
      expect(skillsManager.getStatusInfo().skillCount).toBe(0);
    });
  });

  describe('Skills Management', () => {
    beforeEach(async () => {
      // Setup test skill
      const mockSkillContent = `---
name: test-skill
description: A test skill for unit testing
version: 1.0.0
---

# Test Skill

Test skill content for {{variable}} replacement.
`;

      setupSkillMocks([
        {
          path: '/test/skills',
          skills: [{ name: 'test-skill', content: mockSkillContent }],
        },
      ]);

      await skillsManager.initialize({
        sources: [
          {
            name: 'test-source',
            type: 'local' as const,
            path: '/test/skills',
          },
        ],
      });
    });

    it('should retrieve skill by name', () => {
      const skill = skillsManager.getSkill('test-skill');

      expect(skill).toBeDefined();
      expect(skill?.name).toBe('test-skill');
      expect(skill?.description).toBe('A test skill for unit testing');
    });

    it('should return undefined for nonexistent skill', () => {
      const skill = skillsManager.getSkill('nonexistent-skill');
      expect(skill).toBeUndefined();
    });

    it('should list all available skills', () => {
      const skills = skillsManager.listSkills();

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0]).toHaveProperty('name');
      expect(skills[0]).toHaveProperty('description');
    });

    it('should check skill existence', () => {
      expect(skillsManager.getSkill('test-skill')).toBeDefined();
      expect(skillsManager.getSkill('nonexistent-skill')).toBeUndefined();
    });

    it('should return correct skill count', () => {
      const count = skillsManager.getStatusInfo().skillCount;
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Skills Search', () => {
    beforeEach(async () => {
      // Setup multiple test skills for searching
      const mockSkillContents = [
        `---
name: javascript-helper
description: JavaScript development utilities
version: 1.0.0
---
JavaScript tools and utilities.`,
        `---
name: python-tools
description: Python development utilities
version: 1.0.0
---
Python development tools.`,
        `---
name: web-scraper
description: Web scraping utilities
version: 1.0.0
---
Web scraping tools for data extraction.`,
      ];

      setupSkillMocks([
        {
          path: '/test/skills',
          skills: [
            { name: 'skill1', content: mockSkillContents[0] },
            { name: 'skill2', content: mockSkillContents[1] },
            { name: 'skill3', content: mockSkillContents[2] },
          ],
        },
      ]);

      await skillsManager.initialize({
        sources: [
          {
            name: 'test-skills',
            type: 'local' as const,
            path: '/test/skills',
          },
        ],
      });
    });

    it('should search skills by query', () => {
      const results = skillsManager.searchSkills('javascript');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('javascript-helper');
    });

    it('should return empty array for no matches', () => {
      const results = skillsManager.searchSkills('nonexistent-topic');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should search by description', () => {
      const results = skillsManager.searchSkills('development utilities');

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle malformed skill files gracefully', async () => {
      const config = {
        sources: [
          {
            name: 'malformed-skills',
            type: 'local' as const,
            path: '/test/malformed',
          },
        ],
      };

      mockReaddir
        .mockResolvedValueOnce(['bad-skill'] as any)
        .mockResolvedValueOnce(['SKILL.md'] as any);

      mockStat.mockResolvedValue({ isDirectory: () => true } as any);

      // Mock malformed skill file
      const malformedContent = `---
invalid yaml content
no proper frontmatter
---
Content without proper structure.`;

      mockReadFile.mockResolvedValue(malformedContent);

      await expect(skillsManager.initialize(config)).resolves.not.toThrow();

      // Should not register malformed skills
      expect(skillsManager.getSkill('bad-skill')).toBeUndefined();
    });

    it('should isolate errors during discovery', async () => {
      const config = {
        sources: [
          {
            name: 'mixed-skills',
            type: 'local' as const,
            path: '/test/mixed',
          },
        ],
      };

      mockStat.mockReset();
      mockReaddir.mockReset();
      mockReadFile.mockReset();

      // Default rejections
      mockStat.mockRejectedValue(new Error('ENOENT'));
      mockReaddir.mockRejectedValue(new Error('ENOENT'));
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      // Setup the mixed skills directory
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any); // /test/mixed exists
      mockReaddir.mockResolvedValueOnce(['good-skill', 'bad-skill'] as any); // two skill directories

      // good-skill directory setup
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any); // good-skill dir exists
      mockStat.mockResolvedValueOnce({ isFile: () => true } as any); // good-skill/SKILL.md exists

      // bad-skill directory setup
      mockStat.mockResolvedValueOnce({ isDirectory: () => true } as any); // bad-skill dir exists
      mockStat.mockResolvedValueOnce({ isFile: () => true } as any); // bad-skill/SKILL.md exists (but read fails)

      const goodSkillContent = `---
name: good-skill
description: A working skill
---
Working skill content.`;

      // Good skill file reads successfully, bad skill file read fails
      mockReadFile
        .mockResolvedValueOnce(goodSkillContent)
        .mockRejectedValueOnce(new Error('File read error'));

      await skillsManager.initialize(config);

      // Good skill should be registered despite error with bad skill
      expect(skillsManager.getSkill('good-skill')).toBeDefined();
      expect(skillsManager.getStatusInfo().skillCount).toBe(1);
    });
  });

  describe('Multi-source Support', () => {
    it('should discover skills from multiple sources', async () => {
      const config = {
        sources: [
          {
            name: 'source1',
            type: 'local' as const,
            path: '/test/source1',
          },
          {
            name: 'source2',
            type: 'local' as const,
            path: '/test/source2',
          },
        ],
      };

      const skill1Content = `---
name: skill1
description: First skill
---
Content 1`;

      const skill2Content = `---
name: skill2
description: Second skill
---
Content 2`;

      setupSkillMocks([
        {
          path: '/test/source1',
          skills: [{ name: 'skill1', content: skill1Content }],
        },
        {
          path: '/test/source2',
          skills: [{ name: 'skill2', content: skill2Content }],
        },
      ]);

      await skillsManager.initialize(config);

      expect(skillsManager.getStatusInfo().skillCount).toBe(2);
      expect(skillsManager.getSkill('skill1')).toBeDefined();
      expect(skillsManager.getSkill('skill2')).toBeDefined();
    });

    it('should handle disabled sources', async () => {
      const config = {
        sources: [
          {
            name: 'enabled-source',
            type: 'local' as const,
            path: '/test/enabled',
            enabled: true,
          },
          {
            name: 'disabled-source',
            type: 'local' as const,
            path: '/test/disabled',
            enabled: false,
          },
        ],
      };

      // Setup only the enabled source
      setupSkillMocks([
        {
          path: '/test/enabled',
          skills: [],
        },
      ]);

      await skillsManager.initialize(config);

      // Should only call readdir for the enabled source (not disabled)
      expect(mockReaddir).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should cleanup resources properly', () => {
      expect(() => skillsManager.cleanup()).not.toThrow();
    });

    it('should handle concurrent initialization attempts', async () => {
      mockReaddir.mockResolvedValue([]);
      mockStat.mockResolvedValue({ isDirectory: () => false } as any);

      const promises = [
        skillsManager.initialize(),
        skillsManager.initialize(),
        skillsManager.initialize(),
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });
});
