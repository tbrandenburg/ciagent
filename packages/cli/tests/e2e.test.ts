import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const shouldRunE2ETests = process.env.RUN_E2E_TESTS === '1';

describe('CLI E2E (Smoke)', () => {
  const testDir = '/tmp/cia-e2e-test';
  const testConfigDir = resolve(testDir, '.cia');
  const binaryPathCandidates = [
    resolve(process.cwd(), 'dist/cia'),
    resolve(process.cwd(), '../../dist/cia'),
    resolve(__dirname, '../../../dist/cia'),
  ];
  const binaryPath = binaryPathCandidates.find(path => existsSync(path));

  beforeAll(() => {
    if (!shouldRunE2ETests) {
      console.log('Skipping E2E tests. Set RUN_E2E_TESTS=1 to run them.');
      return;
    }

    if (!binaryPath) {
      throw new Error('E2E binary not found. Build it first with `bun run build`.');
    }

    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
    mkdirSync(testConfigDir, { recursive: true });
  });

  afterAll(() => {
    if (!shouldRunE2ETests) return;
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  const runCLI = (args: string[], options: { cwd?: string } = {}) => {
    return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(binaryPath, args, {
          cwd: options.cwd || process.cwd(),
          env: {
            ...process.env,
            HOME: testDir,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', data => {
          stdout += data.toString();
        });

        child.stderr?.on('data', data => {
          stderr += data.toString();
        });

        child.on('close', code => {
          resolve({ exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() });
        });

        child.on('error', reject);

        setTimeout(() => {
          child.kill();
          reject(new Error('CLI command timed out'));
        }, 10000);
      }
    );
  };

  it('executes help successfully', async () => {
    if (!shouldRunE2ETests) return;
    const result = await runCLI(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('USAGE:');
  });

  it('enforces strict schema requirement', async () => {
    if (!shouldRunE2ETests) return;
    const result = await runCLI(['run', 'test', '--mode=strict']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Strict mode requires either --schema-file or --schema-inline');
  });

  it('rejects unsupported providers', async () => {
    if (!shouldRunE2ETests) return;
    const result = await runCLI(['run', 'test', '--provider=invalid-provider']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Must be one of: azure, codex, claude.');
  });

  it('returns auth/config error when no local auth exists', async () => {
    if (!shouldRunE2ETests) return;
    const result = await runCLI(['run', 'Hello world', '--provider=codex', '--model=gpt-4']);
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('Authentication/configuration error');
  });
});
