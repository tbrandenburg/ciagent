import { describe, it, expect, spyOn, beforeEach, afterEach } from 'bun:test';
import { printVersionInfo } from '../../src/commands/version.js';

describe('Version Command', () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should print version information', async () => {
    await printVersionInfo();

    // Check that version info is printed
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ciagent v'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Bun v'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Platform:'));
  });

  it('should include Bun version', async () => {
    await printVersionInfo();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain(`Bun v${Bun.version}`);
  });

  it('should include platform information', async () => {
    await printVersionInfo();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain(`Platform: ${process.platform}-${process.arch}`);
  });

  it('should include Node.js compatibility info', async () => {
    await printVersionInfo();

    const allOutput = consoleSpy.mock.calls.flat().join('\n');
    expect(allOutput).toContain('Node.js compatibility:');
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
