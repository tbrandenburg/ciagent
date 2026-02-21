import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  normalizeBenchmarkData,
  runCollectMetrics,
} from '../../../../scripts/benchmarks/collect-metrics.ts';

describe('collect-metrics', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('normalizes hyperfine payload into stable summary schema', () => {
    const summary = normalizeBenchmarkData(
      {
        results: [
          {
            command: './dist/cia --help',
            mean: 0.25,
            times: [0.24, 0.25, 0.26],
          },
        ],
      },
      1234
    );

    expect(summary.binarySizeBytes).toBe(1234);
    expect(summary.commands).toEqual([
      {
        command: './dist/cia --help',
        runs: 3,
        meanMs: 250,
        p95Ms: 260,
      },
    ]);
  });

  it('fails loudly for malformed benchmark input with missing fields', () => {
    expect(() => normalizeBenchmarkData({ results: [{}] }, 1)).toThrow(
      'Malformed hyperfine data at index 0: missing command'
    );
  });

  it('returns non-zero for invalid numeric payload values', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cia-metrics-'));
    tempDirs.push(tempDir);

    const inputPath = join(tempDir, 'raw.json');
    const outputPath = join(tempDir, 'summary.json');
    const binaryPath = join(tempDir, 'cia');

    writeFileSync(
      inputPath,
      JSON.stringify({
        tool: 'bun-fallback',
        results: [{ command: './dist/cia --help', runs: 3, mean_ms: 'bad', p95_ms: 10 }],
      })
    );
    writeFileSync(binaryPath, '#!/bin/sh\n');
    chmodSync(binaryPath, 0o755);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = runCollectMetrics([
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--binary',
      binaryPath,
    ]);

    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid numeric field'));
  });

  it('writes normalized summary for Bun fallback payload', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cia-metrics-'));
    tempDirs.push(tempDir);

    const inputPath = join(tempDir, 'raw.json');
    const outputPath = join(tempDir, 'summary.json');
    const binaryPath = join(tempDir, 'cia');

    writeFileSync(
      inputPath,
      JSON.stringify({
        tool: 'bun-fallback',
        results: [{ command: './dist/cia --version', runs: 7, mean_ms: 201.2, p95_ms: 220.7 }],
      })
    );
    writeFileSync(binaryPath, '#!/bin/sh\n');
    chmodSync(binaryPath, 0o755);

    const exitCode = runCollectMetrics([
      '--input',
      inputPath,
      '--output',
      outputPath,
      '--binary',
      binaryPath,
    ]);

    expect(exitCode).toBe(0);
    const summary = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(summary.commands[0]).toEqual({
      command: './dist/cia --version',
      runs: 7,
      meanMs: 201.2,
      p95Ms: 220.7,
    });
    expect(summary.binarySizeBytes).toBeGreaterThan(0);
  });
});
