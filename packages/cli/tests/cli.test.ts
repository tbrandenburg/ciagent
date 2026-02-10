import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { main } from '../src/cli.js';

describe('CLI Main', () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;
  let originalHome: string | undefined;
  const testHome = '/tmp/cia-cli-test-home';

  beforeEach(() => {
    logSpy = spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = spyOn(console, 'error').mockImplementation(() => {});
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
    expect(logSpy).toHaveBeenCalledWith('CIA - Vendor-neutral AI agent CLI tool for CI/CD pipelines');
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
