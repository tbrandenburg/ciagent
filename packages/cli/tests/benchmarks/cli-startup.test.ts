import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';

type StartupMetric = {
  command: string[];
  runs: number;
  meanMs: number;
  p95Ms: number;
  samplesMs: number[];
};

const CLI_PATH = 'packages/cli/src/cli.ts';
const SAMPLE_COUNT = 7;
const WARMUP_COUNT = 1;
const MEAN_BUDGET_MS = 1500;
const P95_BUDGET_MS = 2500;

function runCliAndMeasure(args: string[]): { durationMs: number; exitCode: number | null } {
  const start = performance.now();
  const result = spawnSync('bun', [CLI_PATH, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const durationMs = performance.now() - start;
  return { durationMs, exitCode: result.status };
}

function calculateMetric(args: string[]): StartupMetric {
  for (let i = 0; i < WARMUP_COUNT; i += 1) {
    const warmup = runCliAndMeasure(args);
    expect(warmup.exitCode).toBe(0);
  }

  const samplesMs: number[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const sample = runCliAndMeasure(args);
    expect(sample.exitCode).toBe(0);
    samplesMs.push(Number(sample.durationMs.toFixed(2)));
  }

  const sorted = [...samplesMs].sort((a, b) => a - b);
  const meanMs = samplesMs.reduce((total, current) => total + current, 0) / samplesMs.length;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  const p95Ms = sorted[p95Index];

  return {
    command: args,
    runs: SAMPLE_COUNT,
    meanMs: Number(meanMs.toFixed(2)),
    p95Ms: Number(p95Ms.toFixed(2)),
    samplesMs,
  };
}

describe('cli-startup-benchmark', () => {
  it('captures startup metrics with stable schema for --help', () => {
    const metric = calculateMetric(['--help']);

    expect(metric.command).toEqual(['--help']);
    expect(metric.runs).toBe(SAMPLE_COUNT);
    expect(metric.samplesMs).toHaveLength(SAMPLE_COUNT);
    expect(metric.meanMs).toBeGreaterThan(0);
    expect(metric.p95Ms).toBeGreaterThan(0);
  });

  it('keeps startup overhead for --help under budget', () => {
    const metric = calculateMetric(['--help']);
    expect(metric.meanMs).toBeLessThan(MEAN_BUDGET_MS);
    expect(metric.p95Ms).toBeLessThan(P95_BUDGET_MS);
  });

  it('keeps startup overhead for --version under budget', () => {
    const metric = calculateMetric(['--version']);
    expect(metric.meanMs).toBeLessThan(MEAN_BUDGET_MS);
    expect(metric.p95Ms).toBeLessThan(P95_BUDGET_MS);
  });
});
