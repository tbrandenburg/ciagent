import { readFileSync, statSync, writeFileSync } from 'fs';

type NormalizedCommandMetric = {
  command: string;
  runs: number;
  meanMs: number;
  p95Ms: number;
};

type NormalizedBenchmarkSummary = {
  generatedAt: string;
  binarySizeBytes: number;
  commands: NormalizedCommandMetric[];
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const [key, inlineValue] = token.split('=', 2);
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
      continue;
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${key}`);
    }
    args.set(key, next);
    i += 1;
  }

  const input = args.get('--input');
  const output = args.get('--output');
  const binary = args.get('--binary') ?? 'dist/cia';

  if (!input) {
    throw new Error('Missing required --input path');
  }

  if (!output) {
    throw new Error('Missing required --output path');
  }

  return { input, output, binary };
}

function ensureFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`Invalid numeric field: ${field}`);
  }
  return value;
}

function percentile95(samplesMs: number[]): number {
  if (samplesMs.length === 0) {
    throw new Error('Cannot calculate p95 for empty sample list');
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

function parseHyperfineResult(raw: any): NormalizedCommandMetric[] {
  if (!raw || !Array.isArray(raw.results)) {
    throw new Error('Malformed hyperfine data: expected results array');
  }

  return raw.results.map((result: any, index: number) => {
    if (typeof result.command !== 'string' || !result.command.trim()) {
      throw new Error(`Malformed hyperfine data at index ${index}: missing command`);
    }
    if (!Array.isArray(result.times) || result.times.length === 0) {
      throw new Error(`Malformed hyperfine data at index ${index}: missing times array`);
    }

    const timesMs = result.times.map((time: unknown, timeIndex: number) => {
      const value = ensureFiniteNumber(time, `results[${index}].times[${timeIndex}]`);
      return Number((value * 1000).toFixed(2));
    });

    const meanSeconds = ensureFiniteNumber(result.mean, `results[${index}].mean`);
    const meanMs = Number((meanSeconds * 1000).toFixed(2));
    const p95Ms = Number(percentile95(timesMs).toFixed(2));

    return {
      command: result.command,
      runs: timesMs.length,
      meanMs,
      p95Ms,
    };
  });
}

function parseBunFallbackResult(raw: any): NormalizedCommandMetric[] {
  if (!raw || !Array.isArray(raw.results)) {
    throw new Error('Malformed Bun fallback data: expected results array');
  }

  return raw.results.map((result: any, index: number) => {
    if (typeof result.command !== 'string' || !result.command.trim()) {
      throw new Error(`Malformed Bun fallback data at index ${index}: missing command`);
    }

    const runs = ensureFiniteNumber(result.runs, `results[${index}].runs`);
    const meanMs = ensureFiniteNumber(result.mean_ms, `results[${index}].mean_ms`);
    const p95Ms = ensureFiniteNumber(result.p95_ms, `results[${index}].p95_ms`);

    if (runs <= 0) {
      throw new Error(`Malformed Bun fallback data at index ${index}: runs must be positive`);
    }

    return {
      command: result.command,
      runs,
      meanMs: Number(meanMs.toFixed(2)),
      p95Ms: Number(p95Ms.toFixed(2)),
    };
  });
}

export function normalizeBenchmarkData(
  rawData: unknown,
  binarySizeBytes: number
): NormalizedBenchmarkSummary {
  const raw = rawData as any;

  const commands =
    raw?.tool === 'bun-fallback' ? parseBunFallbackResult(raw) : parseHyperfineResult(raw);

  return {
    generatedAt: new Date().toISOString(),
    binarySizeBytes,
    commands,
  };
}

export function runCollectMetrics(argv: string[]): number {
  try {
    const { input, output, binary } = parseArgs(argv);
    const rawText = readFileSync(input, 'utf8');
    const rawData = JSON.parse(rawText);

    const binarySizeBytes = statSync(binary).size;
    const summary = normalizeBenchmarkData(rawData, binarySizeBytes);
    writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[collect-metrics] ${message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(runCollectMetrics(process.argv.slice(2)));
}
