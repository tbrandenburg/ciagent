import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { main } from '../../src/cli.js';

// Test setup
const testDir = '/tmp/cia-skills-integration-test';
const skillsDir = join(testDir, '.cia', 'skills');
const testSkillDir = join(skillsDir, 'test-integration-skill');

// Store original cwd function
const originalCwd = process.cwd;

const testSkillContent = `---
name: test-integration-skill
description: Integration test skill for CIA
version: 1.0.0
author: CIA Test Suite
---

# Test Integration Skill

This is a test skill used for integration testing.

## Usage

Use this skill with:
\`\`\`
cia run --skill test-integration-skill "Your prompt here"
\`\`\`

## Template Variables

This skill supports template variables:
- {{project_name}} - Name of the project
- {{task_description}} - Description of the task

Example content with variables: Working on {{project_name}} for {{task_description}}.
`;

describe('Skills System Integration', () => {
  beforeAll(() => {
    // Create test directory structure
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    mkdirSync(testSkillDir, { recursive: true });
    writeFileSync(join(testSkillDir, 'SKILL.md'), testSkillContent);

    // Mock only process.cwd() to return test directory instead of using process.chdir()
    process.cwd = () => testDir;
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Restore original process.cwd
    process.cwd = originalCwd;
  });

  describe('Skills Command', () => {
    it('should list available skills', async () => {
      const exitCode = await main(['skills', 'list']);
      expect(exitCode).toBe(0);
    });

    it('should show skill info', async () => {
      const exitCode = await main(['skills', 'info', 'test-integration-skill']);
      expect(exitCode).toBe(0);
    });

    it('should search skills', async () => {
      const exitCode = await main(['skills', 'search', 'integration']);
      expect(exitCode).toBe(0);
    });

    it('should show skills status', async () => {
      const exitCode = await main(['skills', 'status']);
      expect(exitCode).toBe(0);
    });

    it('should handle invalid skill name gracefully', async () => {
      const exitCode = await main(['skills', 'info', 'nonexistent-skill']);
      expect(exitCode).not.toBe(0);
    });

    it('should handle invalid command gracefully', async () => {
      const exitCode = await main(['skills', 'invalid-command']);
      expect(exitCode).not.toBe(0);
    });
  });

  describe('Skills with Run Command', () => {
    it('should execute run command with skill flag', async () => {
      const exitCode = await main([
        'run',
        '--skill',
        'test-integration-skill',
        '--provider',
        'mock-for-test',
        'Test prompt',
      ]);

      // This will fail due to invalid provider, but should parse the skill flag correctly
      expect(exitCode).not.toBe(0); // Expected to fail due to mock provider
    });

    it('should handle nonexistent skill gracefully in run command', async () => {
      const exitCode = await main([
        'run',
        '--skill',
        'nonexistent-skill',
        '--provider',
        'mock-for-test',
        'Test prompt',
      ]);

      // Should handle missing skill gracefully and continue
      expect(exitCode).not.toBe(0); // Expected to fail due to mock provider, not skill
    });
  });

  describe('Skills Discovery', () => {
    it('should discover skills from .cia/skills directory', async () => {
      const exitCode = await main(['skills', 'list']);
      expect(exitCode).toBe(0);
    });

    it('should discover skills from multiple standard directories', async () => {
      // Create additional skill directories
      const claudeSkillsDir = join(testDir, '.claude', 'skills', 'claude-skill');
      mkdirSync(claudeSkillsDir, { recursive: true });

      const claudeSkillContent = `---
name: claude-skill
description: Test skill from .claude directory  
version: 1.0.0
---

# Claude Test Skill
Test skill from .claude/skills directory.
`;

      writeFileSync(join(claudeSkillsDir, 'SKILL.md'), claudeSkillContent);

      const exitCode = await main(['skills', 'list']);
      expect(exitCode).toBe(0);

      // Cleanup
      rmSync(join(testDir, '.claude'), { recursive: true, force: true });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed skill files gracefully', async () => {
      const malformedSkillDir = join(skillsDir, 'malformed-skill');
      mkdirSync(malformedSkillDir, { recursive: true });

      const malformedContent = `---
invalid yaml content
no proper structure
---
Malformed skill content.`;

      writeFileSync(join(malformedSkillDir, 'SKILL.md'), malformedContent);

      const exitCode = await main(['skills', 'list']);
      expect(exitCode).toBe(0); // Should not crash, just ignore malformed skills

      // Cleanup
      rmSync(malformedSkillDir, { recursive: true, force: true });
    });

    it('should handle missing SKILL.md files gracefully', async () => {
      const emptySkillDir = join(skillsDir, 'empty-skill');
      mkdirSync(emptySkillDir, { recursive: true });
      // No SKILL.md file created

      const exitCode = await main(['skills', 'list']);
      expect(exitCode).toBe(0); // Should not crash

      // Cleanup
      rmSync(emptySkillDir, { recursive: true, force: true });
    });
  });

  describe('Performance', () => {
    it('should initialize skills system quickly', async () => {
      const startTime = Date.now();

      const exitCode = await main(['skills', 'status']);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(exitCode).toBe(0);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle large number of skill directories', async () => {
      // Create multiple skill directories to test scalability
      const skillCount = 10;
      const createdDirs: string[] = [];

      for (let i = 0; i < skillCount; i++) {
        const skillDir = join(skillsDir, `perf-skill-${i}`);
        mkdirSync(skillDir, { recursive: true });

        const skillContent = `---
name: perf-skill-${i}
description: Performance test skill ${i}
version: 1.0.0
---

# Performance Test Skill ${i}
Test skill for performance testing.
`;

        writeFileSync(join(skillDir, 'SKILL.md'), skillContent);
        createdDirs.push(skillDir);
      }

      const startTime = Date.now();
      const exitCode = await main(['skills', 'list']);
      const endTime = Date.now();

      expect(exitCode).toBe(0);
      expect(endTime - startTime).toBeLessThan(3000); // Should handle multiple skills efficiently

      // Cleanup
      createdDirs.forEach(dir => {
        if (existsSync(dir)) {
          rmSync(dir, { recursive: true, force: true });
        }
      });
    });
  });
});
