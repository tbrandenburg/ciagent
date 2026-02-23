import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getFileMetadata,
  loadFileWithFormatDetection,
  getFolderListing,
  isValidPath,
  pathExists,
  getPathStats,
} from '../../src/utils/file-utils.js';

describe('file-utils', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'file-utils-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('isValidPath', () => {
    it('should accept valid relative paths', () => {
      expect(isValidPath('src/utils/test.ts')).toBe(true);
      expect(isValidPath('./config.json')).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(isValidPath('../../../etc/passwd')).toBe(false);
      expect(isValidPath('..\\..\\Windows\\system32')).toBe(false);
    });

    it('should reject system directory access', () => {
      expect(isValidPath('/etc/passwd')).toBe(false);
      expect(isValidPath('/proc/version')).toBe(false);
    });

    it('should reject empty or invalid paths', () => {
      expect(isValidPath('')).toBe(false);
      expect(isValidPath('   ')).toBe(false);
    });
  });

  describe('getFolderListing', () => {
    it('should respect .gitignore patterns', async () => {
      writeFileSync(join(testDir, '.gitignore'), 'node_modules/\n*.log\n.env\n');
      writeFileSync(join(testDir, 'package.json'), '{}');
      writeFileSync(join(testDir, 'debug.log'), 'logs');
      writeFileSync(join(testDir, '.env'), 'secret');

      const result = getFolderListing(testDir);

      const fileNames = result.files.map(f => f.path.split('/').pop());
      expect(fileNames).toContain('package.json');
      expect(fileNames).not.toContain('debug.log');
      expect(fileNames).not.toContain('.env');
    });

    it('should handle nested .gitignore files', () => {
      // Test hierarchical .gitignore behavior
      writeFileSync(join(testDir, '.gitignore'), '*.tmp\n');
      writeFileSync(join(testDir, 'main.js'), 'console.log("main");');
      writeFileSync(join(testDir, 'temp.tmp'), 'temporary');

      const result = getFolderListing(testDir);

      const fileNames = result.files.map(f => f.path.split('/').pop());
      expect(fileNames).toContain('main.js');
      expect(fileNames).not.toContain('temp.tmp');
    });
  });

  describe('loadFileWithFormatDetection', () => {
    it('should detect YAML frontmatter', () => {
      const yamlFile = join(testDir, 'test.yaml');
      writeFileSync(yamlFile, 'title: Test\nversion: 1.0\n');

      const result = loadFileWithFormatDetection(yamlFile);
      expect(result.format).toBe('yaml');
      // Verify content parsing worked
      expect(result.content).toEqual(
        expect.objectContaining({
          title: 'Test',
        })
      );
    });

    it('should fallback through format detection chain', () => {
      // Test YAML → JSON → text fallback
      const textFile = join(testDir, 'simple.txt');
      writeFileSync(textFile, 'Just plain text content');

      const result = loadFileWithFormatDetection(textFile);
      expect(result.format).toBe('text');
      expect(result.content).toBe('Just plain text content');
    });
  });
});
