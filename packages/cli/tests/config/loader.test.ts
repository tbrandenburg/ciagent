import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/shared/config/loader.js';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

describe('Configuration Loader', () => {
  const testUserHome = '/tmp/cia-test-user';
  const testUserConfigDir = resolve(testUserHome, '.cia');
  const testUserConfigFile = resolve(testUserConfigDir, 'config.json');
  const repoConfigDir = resolve(process.cwd(), '.cia');
  const repoConfigFile = resolve(repoConfigDir, 'config.json');

  beforeEach(() => {
    // Set test HOME directory
    process.env.HOME = testUserHome;

    // Clean up test directories
    if (existsSync(testUserConfigFile)) {
      unlinkSync(testUserConfigFile);
    }
    if (existsSync(testUserConfigDir)) {
      rmSync(testUserConfigDir, { recursive: true, force: true });
    }
    if (existsSync(repoConfigFile)) {
      unlinkSync(repoConfigFile);
    }
    if (existsSync(repoConfigDir)) {
      rmSync(repoConfigDir, { recursive: true, force: true });
    }

    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.NO_PROXY;
    delete process.env.NODE_EXTRA_CA_CERTS;
    delete process.env.NODE_USE_ENV_PROXY;
  });

  afterEach(() => {
    // Clean up test directories
    if (existsSync(testUserConfigFile)) {
      unlinkSync(testUserConfigFile);
    }
    if (existsSync(testUserConfigDir)) {
      rmSync(testUserConfigDir, { recursive: true, force: true });
    }
    if (existsSync(repoConfigFile)) {
      unlinkSync(repoConfigFile);
    }
    if (existsSync(repoConfigDir)) {
      rmSync(repoConfigDir, { recursive: true, force: true });
    }

    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.NO_PROXY;
    delete process.env.NODE_EXTRA_CA_CERTS;
    delete process.env.NODE_USE_ENV_PROXY;
  });

  describe('Configuration Hierarchy', () => {
    it('should load CLI args with highest priority', () => {
      const config = loadConfig({ provider: 'codex', model: 'gpt-4' });
      expect(config.provider).toBe('codex');
      expect(config.model).toBe('gpt-4');
    });

    it('should merge configurations correctly', () => {
      // Set up user config
      mkdirSync(testUserConfigDir, { recursive: true });
      writeFileSync(
        testUserConfigFile,
        JSON.stringify({
          provider: 'codex',
          model: 'gpt-3.5-turbo',
          timeout: 30,
        })
      );

      // CLI args should override user config
      const config = loadConfig({
        provider: 'codex', // Should override config file provider
        'log-level': 'DEBUG', // Should be added
      });

      expect(config.provider).toBe('codex'); // CLI override
      expect(config.model).toBe('gpt-3.5-turbo'); // From user config
      expect(config.timeout).toBe(30); // From user config
      expect(config['log-level']).toBe('DEBUG'); // From CLI
    });

    it('should handle missing config files gracefully', () => {
      const config = loadConfig({ provider: 'codex' });
      expect(config.provider).toBe('codex');
    });
  });

  describe('Environment Variables', () => {
    it('should load from environment variables', () => {
      const originalProvider = process.env.CIA_PROVIDER;
      const originalModel = process.env.CIA_MODEL;

      process.env.CIA_PROVIDER = 'codex';
      process.env.CIA_MODEL = 'gemini-pro';

      const config = loadConfig();
      expect(config.provider).toBe('codex');
      expect(config.model).toBe('gemini-pro');

      // Restore environment
      if (originalProvider) {
        process.env.CIA_PROVIDER = originalProvider;
      } else {
        delete process.env.CIA_PROVIDER;
      }
      if (originalModel) {
        process.env.CIA_MODEL = originalModel;
      } else {
        delete process.env.CIA_MODEL;
      }
    });

    it('should normalize enterprise network environment variables', () => {
      process.env.HTTP_PROXY = 'http://corp-proxy.internal:8080';
      process.env.HTTPS_PROXY = 'http://corp-proxy.internal:8443';
      process.env.NO_PROXY = ' localhost, 127.0.0.1, internal.local ';
      process.env.NODE_EXTRA_CA_CERTS = ' /etc/ssl/corp-ca.pem ';
      process.env.NODE_USE_ENV_PROXY = 'true';

      const config = loadConfig();

      expect(config.network).toEqual({
        'http-proxy': 'http://corp-proxy.internal:8080',
        'https-proxy': 'http://corp-proxy.internal:8443',
        'no-proxy': ['localhost', '127.0.0.1', 'internal.local'],
        'ca-bundle-path': '/etc/ssl/corp-ca.pem',
        'use-env-proxy': true,
      });
    });

    it('should preserve precedence for network config (env < user < repo < cli)', () => {
      process.env.HTTP_PROXY = 'http://env-proxy:8080';

      mkdirSync(testUserConfigDir, { recursive: true });
      writeFileSync(
        testUserConfigFile,
        JSON.stringify({
          network: {
            'http-proxy': 'http://user-proxy:8080',
            'ca-bundle-path': '/user/ca.pem',
          },
        })
      );

      mkdirSync(repoConfigDir, { recursive: true });
      writeFileSync(
        repoConfigFile,
        JSON.stringify({
          network: {
            'http-proxy': 'http://repo-proxy:8080',
            'ca-bundle-path': '/repo/ca.pem',
          },
        })
      );

      const config = loadConfig({
        network: {
          'http-proxy': 'http://cli-proxy:8080',
          'ca-bundle-path': '/cli/ca.pem',
        },
      });

      expect(config.network).toEqual({
        'http-proxy': 'http://cli-proxy:8080',
        'ca-bundle-path': '/cli/ca.pem',
      });
    });
  });

  describe('Array Merging', () => {
    it('should concatenate context arrays', () => {
      const userConfig = { context: ['file1.txt', 'file2.txt'] };
      const cliConfig = { context: ['file3.txt'] };

      mkdirSync(testUserConfigDir, { recursive: true });
      writeFileSync(testUserConfigFile, JSON.stringify(userConfig));

      const config = loadConfig(cliConfig);
      expect(config.context).toEqual(['file1.txt', 'file2.txt', 'file3.txt']);
    });
  });

  describe('Configuration Validation', () => {
    it('should handle missing config files gracefully', () => {
      // When no config files exist, should return empty config (defaults are set in CLI parsing)
      const config = loadConfig();
      expect(config).toBeDefined();
      // Config loader doesn't set defaults - that's done in CLI argument parsing
      expect(typeof config).toBe('object');
    });

    // NOTE: Cannot test malformed JSON handling because it calls process.exit()
    // This is correct CLI behavior but not testable in unit tests
  });

  describe('Enhanced Configuration Fields', () => {
    it('should load enhanced config with mcp.servers, skills, and tools fields', () => {
      // Set up user config with new enhanced fields
      mkdirSync(testUserConfigDir, { recursive: true });
      writeFileSync(
        testUserConfigFile,
        JSON.stringify({
          provider: 'codex',
          model: 'gpt-4',
          mcp: {
            servers: [
              {
                name: 'filesystem',
                command: 'node',
                args: ['./mcp-server-filesystem.js'],
                env: { NODE_ENV: 'production' },
              },
            ],
          },
          skills: {
            sources: [
              {
                name: 'code-review',
                path: '/skills/code-review',
                enabled: true,
              },
              {
                name: 'documentation',
                path: '/skills/docs',
                enabled: false,
              },
            ],
          },
          tools: {
            enabled: true,
            maxTools: 10,
            timeout: 30000,
          },
        })
      );

      const config = loadConfig();

      // Verify basic config still works
      expect(config.provider).toBe('codex');
      expect(config.model).toBe('gpt-4');

      // Verify enhanced config fields are loaded with proper types
      expect(config.mcp).toBeDefined();
      expect(config.mcp?.servers).toBeDefined();
      expect(config.mcp?.servers.length).toBe(1);
      expect(config.mcp?.servers[0].name).toBe('filesystem');
      expect(config.mcp?.servers[0].command).toBe('node');
      expect(config.mcp?.servers[0].args).toEqual(['./mcp-server-filesystem.js']);
      expect(config.mcp?.servers[0].env).toEqual({ NODE_ENV: 'production' });

      expect(config.skills).toBeDefined();
      expect(config.skills?.sources).toBeDefined();
      expect(config.skills?.sources.length).toBe(2);
      expect(config.skills?.sources[0].name).toBe('code-review');
      expect(config.skills?.sources[0].path).toBe('/skills/code-review');
      expect(config.skills?.sources[0].enabled).toBe(true);

      expect(config.tools).toBeDefined();
      expect(config.tools?.enabled).toBe(true);
      expect(config.tools?.maxTools).toBe(10);
      expect(config.tools?.timeout).toBe(30000);
    });

    it('should handle partial enhanced config gracefully', () => {
      // Set up user config with only some enhanced fields
      mkdirSync(testUserConfigDir, { recursive: true });
      writeFileSync(
        testUserConfigFile,
        JSON.stringify({
          provider: 'codex',
          skills: {
            sources: [
              {
                name: 'linting',
                path: '/skills/linting',
              },
            ],
          },
          // Missing mcp and tools - should be undefined
        })
      );

      const config = loadConfig();

      expect(config.provider).toBe('codex');
      expect(config.skills?.sources).toBeDefined();
      expect(config.skills?.sources.length).toBe(1);
      expect(config.skills?.sources[0].name).toBe('linting');
      expect(config.mcp).toBeUndefined();
      expect(config.tools).toBeUndefined();
    });
  });
});
