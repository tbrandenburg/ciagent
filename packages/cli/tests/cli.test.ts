import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { main, withDefaults } from '../src/cli.js';

describe('CLI Main', () => {
  let logSpy: any;
  let errorSpy: any;
  let originalHome: string | undefined;
  const testHome = '/tmp/cia-cli-test-home';

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalHome = process.env.HOME;
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
    mkdirSync(resolve(testHome), { recursive: true });
    process.env.HOME = testHome;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
    if (originalHome) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
  });

  it('prints help', async () => {
    const exitCode = await main(['--help']);
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      'CIA - Vendor-neutral AI agent CLI tool for CI/CD pipelines'
    );
  });

  it('prints version', async () => {
    const exitCode = await main(['--version']);
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ciagent v'));
  });

  it('fails on invalid arguments', async () => {
    const exitCode = await main(['--invalid-arg']);
    expect(exitCode).toBe(1);
  });

  it('fails on unknown command', async () => {
    const exitCode = await main(['unknown-command']);
    expect(exitCode).toBe(1);
  });

  it('enforces strict mode schema requirement', async () => {
    const exitCode = await main(['run', 'test', '--mode=strict']);
    expect(exitCode).toBe(1);
  });

  it('rejects unsupported provider', async () => {
    const exitCode = await main(['run', 'test', '--provider=local']);
    expect(exitCode).toBe(1);
  });

  it('fails run command when prompt is missing', async () => {
    const exitCode = await main(['run']);
    expect(exitCode).toBe(1);
  });

  it('prints models in json format', async () => {
    const exitCode = await main(['models', '--format=json']);
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"models"'));
  });
});

describe('Context-aware retry defaults', () => {
  let originalStdinIsTTY: boolean;
  let originalStdoutIsTTY: boolean;
  let originalCI: string | undefined;

  beforeEach(() => {
    // Save original values
    originalStdinIsTTY = process.stdin.isTTY;
    originalStdoutIsTTY = process.stdout.isTTY;
    originalCI = process.env.CI;
  });

  afterEach(() => {
    // Restore original values
    (process.stdin as any).isTTY = originalStdinIsTTY;
    (process.stdout as any).isTTY = originalStdoutIsTTY;
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it('should default to 0 retries in interactive context', () => {
    // Mock interactive environment
    (process.stdin as any).isTTY = true;
    (process.stdout as any).isTTY = true;
    delete process.env.CI;

    const config = withDefaults({});
    expect(config.retries).toBe(0);
  });

  it('should default to 1 retry in CI context', () => {
    // Mock CI environment
    (process.stdin as any).isTTY = true;
    (process.stdout as any).isTTY = true;
    process.env.CI = 'true';

    const config = withDefaults({});
    expect(config.retries).toBe(1);

    delete process.env.CI;
  });

  it('should default to 1 retry in non-TTY context', () => {
    // Mock non-interactive (piped) environment
    (process.stdin as any).isTTY = false;
    (process.stdout as any).isTTY = true;
    delete process.env.CI;

    const config = withDefaults({});
    expect(config.retries).toBe(1);
  });

  it('should preserve explicit retry configuration', () => {
    // Mock interactive environment
    (process.stdin as any).isTTY = true;
    (process.stdout as any).isTTY = true;
    delete process.env.CI;

    const config = withDefaults({ retries: 5 });
    expect(config.retries).toBe(5);
  });
});
