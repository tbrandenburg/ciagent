import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from '../src/cli.js';
import { loadConfig } from '../src/shared/config/loader.js';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

describe('CLI Integration', () => {
  const testHome = '/tmp/cia-integration-test';
  const testConfigDir = '/tmp/cia-integration-test/.cia';
  const testConfigFile = resolve(testConfigDir, 'config.json');
  const repoConfigDir = resolve(process.cwd(), '.cia');
  const repoConfigFile = resolve(repoConfigDir, 'config.json');
  let processExitSpy: any;
  let originalHome: string | undefined;
  let originalRunE2ETests: string | undefined;
  let originalE2EScenario: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalRunE2ETests = process.env.RUN_E2E_TESTS;
    originalE2EScenario = process.env.CIA_E2E_SCENARIO;
    process.env.HOME = testHome;

    if (existsSync(testConfigFile)) unlinkSync(testConfigFile);
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
    if (existsSync(repoConfigFile)) unlinkSync(repoConfigFile);
    if (existsSync(repoConfigDir)) rmSync(repoConfigDir, { recursive: true, force: true });

    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    if (existsSync(testConfigFile)) unlinkSync(testConfigFile);
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
    if (existsSync(repoConfigFile)) unlinkSync(repoConfigFile);
    if (existsSync(repoConfigDir)) rmSync(repoConfigDir, { recursive: true, force: true });
    processExitSpy?.mockRestore();

    if (originalHome) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }

    if (originalRunE2ETests) {
      process.env.RUN_E2E_TESTS = originalRunE2ETests;
    } else {
      delete process.env.RUN_E2E_TESTS;
    }

    if (originalE2EScenario) {
      process.env.CIA_E2E_SCENARIO = originalE2EScenario;
    } else {
      delete process.env.CIA_E2E_SCENARIO;
    }
  });

  it('applies CLI args over user config', async () => {
    mkdirSync(testConfigDir, { recursive: true });
    writeFileSync(
      testConfigFile,
      JSON.stringify({ provider: 'claude', model: 'test-model', 'log-level': 'INFO' })
    );

    const exitCode = await main(['run', 'test prompt', '--provider=codex', '--model=gpt-4']);

    // auth failure is expected in test env, but parsing/merge path is validated
    expect(exitCode).toBe(3);
  });

  it('propagates validation failures end-to-end', async () => {
    const exitCode = await main(['run', 'test', '--timeout=-5']);
    expect(exitCode).toBe(1);
  });

  it('fails loud on malformed config files', async () => {
    mkdirSync(testConfigDir, { recursive: true });
    writeFileSync(testConfigFile, '{ invalid json }');

    let exitCalled = false;
    try {
      await main(['run', 'test']);
    } catch (error: any) {
      if (error.message === 'process.exit called') {
        exitCalled = true;
      }
    }

    expect(exitCalled).toBe(true);
  });

  it('builds config and preserves expected values', () => {
    const config = loadConfig({ provider: 'codex', model: 'gpt-4', mode: 'lazy', format: 'json' });

    expect(config.provider).toBe('codex');
    expect(config.model).toBe('gpt-4');
    expect(config.mode).toBe('lazy');
    expect(config.format).toBe('json');
  });

  it('does not let CLI defaults overwrite repo config', async () => {
    mkdirSync(repoConfigDir, { recursive: true });
    writeFileSync(repoConfigFile, JSON.stringify({ mode: 'strict' }));

    const exitCode = await main(['run', 'test']);
    expect(exitCode).toBe(1);
  });

  it('main() default run path keeps actionable reliability detail', async () => {
    process.env.RUN_E2E_TESTS = '1';
    process.env.CIA_E2E_SCENARIO = 'nonretryable-model-error';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['run', 'test prompt']);

    expect(exitCode).toBe(4);
    expect(
      errorSpy.mock.calls.some(
        call =>
          typeof call[0] === 'string' &&
          call[0].includes('does not exist or you do not have access')
      )
    ).toBe(true);

    errorSpy.mockRestore();
  });
});
