# Benchmarks

This project includes a repeatable benchmark lane for CLI startup overhead and binary size tracking.

## Quick Start

Run the full benchmark lane:

```bash
make benchmark
```

Run benchmark tests and harness together:

```bash
make validate-bench
```

## What Gets Measured

- Startup command latency for:
  - `./dist/cia --help`
  - `./dist/cia --version`
- Binary size for `dist/cia` in bytes and human-readable units

## Artifact Outputs

All benchmark artifacts are written to `test-results/benchmarks/`.

- `raw.json`: raw benchmark output (Hyperfine JSON or Bun fallback schema)
- `raw.txt`: console output from benchmark execution
- `summary.json`: normalized metrics used for CI comparisons
- `report.md`: human-readable snapshot with binary size metadata

`summary.json` fields:

- `generatedAt`: ISO timestamp
- `binarySizeBytes`: integer size of `dist/cia`
- `commands[]`:
  - `command`
  - `runs`
  - `meanMs`
  - `p95Ms`

## Budgets and Guardrails

Current startup test budgets (in-repo benchmark tests):

- mean: `< 1500ms`
- p95: `< 2500ms`

Binary size is captured on each run and included in artifacts for regression review.

## Tooling Notes

- Preferred benchmark tool: `hyperfine` (auto-detected)
- Fallback: Bun-based timing runner if `hyperfine` is not installed
- No extra setup is required for fallback mode

## Interpreting Results

- Compare results from the same machine/runner type only
- Track trend deltas over time instead of comparing absolute values across hosts
- Investigate sustained increases in both startup timings and binary size together

## Common Failure Modes

- Missing `dist/cia`: benchmark runner auto-builds before measuring
- Malformed `raw.json`: `collect-metrics.ts` fails with non-zero exit and explicit error
- Unexpected timing variance: rerun benchmark lane and compare p95 drift
- Missing optional `hyperfine`: fallback path runs automatically
