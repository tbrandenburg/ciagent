import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printVersionInfo } from '../../src/commands/version.js';

describe('Version Command', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should print version information', async () => {
    await printVersionInfo();

    // Check that version info is printed
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ciagent v'));
    // Should show runtime info (either Bun or Node.js)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/(Bun v|Node\.js v)/));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Platform:'));
  });

  it('should include runtime version', async () => {
    await printVersionInfo();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    // Should show either Bun or Node.js version depending on environment
    expect(allOutput).toMatch(/(Bun v|Node\.js v)/);
  });

  it('should include platform information', async () => {
    await printVersionInfo();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain(`Platform: ${process.platform}-${process.arch}`);
  });

  it('should adapt to runtime environment', async () => {
    await printVersionInfo();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    // In vitest/Node environment, should show Node.js version
    if (typeof Bun === 'undefined') {
      expect(allOutput).toContain('Node.js v');
      expect(allOutput).not.toContain('Node.js compatibility:');
    } else {
      // In Bun environment, should show Bun version
      expect(allOutput).toContain('Bun v');
    }
  });

  it('should show debug info when DEBUG env var is set', async () => {
    const originalDebug = process.env.DEBUG;
    process.env.DEBUG = '1';

    await printVersionInfo();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('Process ID:');
    expect(allOutput).toContain('Working Directory:');

    // Restore environment
    if (originalDebug) {
      process.env.DEBUG = originalDebug;
    } else {
      delete process.env.DEBUG;
    }
  });
});
