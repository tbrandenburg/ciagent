import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { loadConfig } from './loader.js';
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
    if (existsSync(testUserConfigFile)) unlinkSync(testUserConfigFile);
    if (existsSync(testUserConfigDir)) rmSync(testUserConfigDir, { recursive: true, force: true });
    if (existsSync(repoConfigFile)) unlinkSync(repoConfigFile);
    if (existsSync(repoConfigDir)) rmSync(repoConfigDir, { recursive: true, force: true });
  });

  afterEach(() => {
    // Clean up test directories
    if (existsSync(testUserConfigFile)) unlinkSync(testUserConfigFile);
    if (existsSync(testUserConfigDir)) rmSync(testUserConfigDir, { recursive: true, force: true });
    if (existsSync(repoConfigFile)) unlinkSync(repoConfigFile);
    if (existsSync(repoConfigDir)) rmSync(repoConfigDir, { recursive: true, force: true });
  });

  describe('Configuration Hierarchy', () => {
    it('should load CLI args with highest priority', () => {
      const config = loadConfig({ provider: 'openai', model: 'gpt-4' });
      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4');
    });

    it('should merge configurations correctly', () => {
      // Set up user config
      mkdirSync(testUserConfigDir, { recursive: true });
      writeFileSync(testUserConfigFile, JSON.stringify({
        provider: 'azure',
        model: 'gpt-3.5-turbo',
        timeout: 30
      }));

      // CLI args should override user config
      const config = loadConfig({ 
        provider: 'openai', // Should override azure
        'log-level': 'DEBUG' // Should be added
      });

      expect(config.provider).toBe('openai'); // CLI override
      expect(config.model).toBe('gpt-3.5-turbo'); // From user config
      expect(config.timeout).toBe(30); // From user config
      expect(config['log-level']).toBe('DEBUG'); // From CLI
    });

    it('should handle missing config files gracefully', () => {
      const config = loadConfig({ provider: 'azure' });
      expect(config.provider).toBe('azure');
    });
  });

  describe('Environment Variables', () => {
    it('should load from environment variables', () => {
      const originalProvider = process.env.CIA_PROVIDER;
      const originalModel = process.env.CIA_MODEL;

      process.env.CIA_PROVIDER = 'google';
      process.env.CIA_MODEL = 'gemini-pro';

      const config = loadConfig();
      expect(config.provider).toBe('google');
      expect(config.model).toBe('gemini-pro');

      // Restore environment
      if (originalProvider) process.env.CIA_PROVIDER = originalProvider;
      else delete process.env.CIA_PROVIDER;
      if (originalModel) process.env.CIA_MODEL = originalModel;
      else delete process.env.CIA_MODEL;
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
});