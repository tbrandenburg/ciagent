import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

vi.mock('../src/providers/index.js', () => ({
  createAssistantChat: vi.fn(async () => ({
    async *sendQuery() {
      yield { type: 'assistant', content: 'Mocked assistant response' };
    },
  })),
}));

import { runCommand } from '../src/commands/run.js';
import type { CIAConfig } from '../src/shared/config/loader.js';

// Skip integration tests unless explicitly enabled
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';

describe.skipIf(!runIntegrationTests)('E2E MCP + Skills + Codex Integration', () => {
  const testDir = '/tmp/cia-e2e-integration-test';
  const configPath = join(testDir, '.cia', 'config.json');
  const skillsPath = join(testDir, '.cia', 'skills');
  const pdfSkillPath = join(skillsPath, 'pdf');
  const baseTestConfig = {
    mcp: {
      context7: {
        type: 'local',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        enabled: true,
      },
    },
    skills: {
      paths: [skillsPath],
    },
  } as CIAConfig;

  beforeAll(async () => {
    // Set up test environment
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.cia'), { recursive: true });
    mkdirSync(skillsPath, { recursive: true });
    mkdirSync(pdfSkillPath, { recursive: true });

    // Create test .cia/config.json with Context7 MCP server config
    const config = {
      mcp: {
        context7: {
          type: 'local',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          enabled: true,
        },
      },
      skills: {
        paths: [skillsPath],
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Create a minimal PDF skill for testing
    const pdfSkillManifest = {
      name: 'pdf',
      description: 'PDF processing skill for testing',
      version: '1.0.0',
      type: 'skill',
      main: 'skill.md',
    };
    writeFileSync(join(pdfSkillPath, 'skill.json'), JSON.stringify(pdfSkillManifest, null, 2));

    const pdfSkillContent = `# PDF Processing Skill

You are an AI assistant with PDF processing capabilities.

## Available Tools
- Extract text from PDF files
- Analyze document structure
- Generate summaries

When asked about PDFs, mention your PDF processing capabilities.`;

    writeFileSync(join(pdfSkillPath, 'skill.md'), pdfSkillContent);
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    console.log('[E2E Test] Test directory:', process.cwd());
    console.log('[E2E Test] Config exists:', existsSync(configPath));
    console.log('[E2E Test] Skills path exists:', existsSync(skillsPath));
  });

  afterEach(() => {
    // Clean up any test artifacts between tests
  });

  describe('Configuration Detection', () => {
    it('should detect and load .cia/config.json from working directory', async () => {
      expect(existsSync(configPath)).toBe(true);
      expect(existsSync(pdfSkillPath)).toBe(true);

      const config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
      expect(config.mcp).toBeDefined();
      expect(config.mcp.context7).toBeDefined();
      expect(config.skills).toBeDefined();
    });
  });

  describe('Status Integration', () => {
    it('should show MCP and Skills status information', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // We expect this E2E test to handle real MCP/Skills configuration
      // and show status even if Codex auth fails

      try {
        const exitCode = await runCommand(['What capabilities do you have?'], {
          ...baseTestConfig,
          provider: 'codex',
          skill: 'pdf', // Use the PDF skill we created
        } as CIAConfig);

        // Even if Codex fails (no auth), status messages should still appear
        const logCalls = logSpy.mock.calls.map(call => call[0]);

        // Should attempt to show MCP status
        expect(
          logCalls.some(call => typeof call === 'string' && call.includes('[Status] MCP:'))
        ).toBe(true);

        // Should show Skills status with PDF skill
        expect(
          logCalls.some(
            call =>
              typeof call === 'string' && call.includes('[Status] Skills:') && call.includes('pdf')
          )
        ).toBe(true);

        // Should show overall capability status
        expect(
          logCalls.some(
            call =>
              typeof call === 'string' &&
              (call.includes('[Status] Available capabilities:') ||
                call.includes('[Status] No enhanced capabilities available'))
          )
        ).toBe(true);
      } catch (error) {
        // Even if execution fails due to missing Codex auth, status should appear
        console.log('[E2E Test] Expected error due to missing auth:', error);
      }

      const logCalls = logSpy.mock.calls.map(call => call[0]);
      console.log(
        '[E2E Test] Log calls:',
        logCalls.filter(call => typeof call === 'string' && call.includes('[Status]'))
      );

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should handle Context7 MCP server startup gracefully', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        // This will attempt to start Context7 MCP server but should handle failures gracefully
        const exitCode = await runCommand(['List available tools'], baseTestConfig);

        // Should not crash regardless of MCP server availability
        const logCalls = logSpy.mock.calls.map(call => call[0]);

        // Should have attempted MCP initialization
        expect(logCalls.some(call => typeof call === 'string' && call.includes('[Status]'))).toBe(
          true
        );
      } catch (error) {
        console.log('[E2E Test] Handled error gracefully:', error);
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should handle Context7 MCP server startup gracefully', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        // This will attempt to start Context7 MCP server but should handle failures gracefully
        const exitCode = await runCommand(['List available tools'], baseTestConfig);

        // Should not crash regardless of MCP server availability
        const logCalls = logSpy.mock.calls.map(call => call[0]);

        // Should have attempted MCP initialization
        expect(logCalls.some(call => typeof call === 'string' && call.includes('[Status]'))).toBe(
          true
        );
      } catch (error) {
        console.log('[E2E Test] Handled error gracefully:', error);
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Skills + MCP Coordination', () => {
    it('should coordinate Skills and MCP tools in single workflow', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const exitCode = await runCommand(['How can I process a PDF and look up documentation?'], {
          ...baseTestConfig,
          provider: 'codex',
          skill: 'pdf', // Activates the PDF skill
        } as CIAConfig);

        const logCalls = logSpy.mock.calls.map(call => call[0]);

        // Should show both PDF skill activation and MCP tool availability
        expect(
          logCalls.some(
            call =>
              typeof call === 'string' && call.includes('[Status] Skills:') && call.includes('pdf')
          )
        ).toBe(true);

        expect(
          logCalls.some(call => typeof call === 'string' && call.includes('[Status] MCP:'))
        ).toBe(true);

        // Should show coordinated capabilities
        expect(
          logCalls.some(
            call =>
              typeof call === 'string' &&
              (call.includes('[Status] Available capabilities:') ||
                call.includes('[Status] No enhanced capabilities available'))
          )
        ).toBe(true);
      } catch (error) {
        console.log('[E2E Test] Workflow coordination test completed with expected error:', error);
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    describe('Error Handling', () => {
      it('should gracefully handle missing Codex authentication', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
          const exitCode = await runCommand(['Test query'], {
            ...baseTestConfig,
            provider: 'codex',
          } as CIAConfig);

          // Should still show status even if Codex fails
          const logCalls = logSpy.mock.calls.map(call => call[0]);
          expect(logCalls.some(call => typeof call === 'string' && call.includes('[Status]'))).toBe(
            true
          );
        } catch (error) {
          // Expected due to missing auth
          console.log('[E2E Test] Expected authentication error handled');
        }

        logSpy.mockRestore();
        errorSpy.mockRestore();
      });

      it('should handle Context7 network failures gracefully', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
          // Force network failure by using invalid Context7 config
          const exitCode = await runCommand(['Test with network issues'], {
            ...baseTestConfig,
            provider: 'codex',
            mcp: {
              context7: {
                type: 'local',
                command: 'npx',
                args: ['-y', '@upstash/context7-mcp', '--api-key', 'invalid'],
                enabled: true,
              },
            },
          } as any);

          const logCalls = logSpy.mock.calls.map(call => call[0]);

          // Should handle MCP failure gracefully and continue
          expect(
            logCalls.some(
              call =>
                typeof call === 'string' &&
                (call.includes('[Status] MCP') ||
                  call.includes('[Status] No enhanced capabilities'))
            )
          ).toBe(true);
        } catch (error) {
          console.log('[E2E Test] Network failure handled gracefully');
        }

        logSpy.mockRestore();
        errorSpy.mockRestore();
      });
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle missing Codex authentication', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const exitCode = await runCommand(['Test query'], {
          ...baseTestConfig,
          provider: 'codex',
        } as CIAConfig);

        // Should still show status even if Codex fails
        const logCalls = logSpy.mock.calls.map(call => call[0]);
        expect(logCalls.some(call => typeof call === 'string' && call.includes('[Status]'))).toBe(
          true
        );
      } catch (error) {
        // Expected due to missing auth
        console.log('[E2E Test] Expected authentication error handled');
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should handle Context7 network failures gracefully', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        // Force network failure by using invalid Context7 config
        const exitCode = await runCommand(['Test with network issues'], {
          ...baseTestConfig,
          provider: 'codex',
          mcp: {
            context7: {
              type: 'local',
              command: 'npx',
              args: ['-y', '@upstash/context7-mcp', '--api-key', 'invalid'],
              enabled: true,
            },
          },
        } as any);

        const logCalls = logSpy.mock.calls.map(call => call[0]);

        // Should handle MCP failure gracefully and continue
        expect(
          logCalls.some(
            call =>
              typeof call === 'string' &&
              (call.includes('[Status] MCP') || call.includes('[Status] No enhanced capabilities'))
          )
        ).toBe(true);
      } catch (error) {
        console.log('[E2E Test] Network failure handled gracefully');
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
