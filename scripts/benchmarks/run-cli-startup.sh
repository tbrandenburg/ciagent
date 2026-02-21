#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BENCH_DIR="${ROOT_DIR}/test-results/benchmarks"
RAW_JSON="${BENCH_DIR}/raw.json"
RAW_TXT="${BENCH_DIR}/raw.txt"
REPORT_MD="${BENCH_DIR}/report.md"
BINARY_PATH="${ROOT_DIR}/dist/cia"

mkdir -p "${BENCH_DIR}"

if [[ ! -x "${BINARY_PATH}" ]]; then
  echo "[bench] dist/cia not found, building CLI binary"
  (cd "${ROOT_DIR}" && bun run build)
fi

if [[ ! -x "${BINARY_PATH}" ]]; then
  echo "[bench] error: binary not available at ${BINARY_PATH}" >&2
  exit 1
fi

SIZE_BYTES="$(stat -c%s "${BINARY_PATH}")"
SIZE_HUMAN="$(du -h "${BINARY_PATH}" | cut -f1)"

if command -v hyperfine >/dev/null 2>&1; then
  echo "[bench] using hyperfine"
  (cd "${ROOT_DIR}" && hyperfine --warmup 1 --runs 7 --export-json "${RAW_JSON}" "./dist/cia --help" "./dist/cia --version") | tee "${RAW_TXT}"
else
  echo "[bench] hyperfine not found, using Bun fallback timing"
  (cd "${ROOT_DIR}" && bun -e '
    import { spawnSync } from "node:child_process";
    import { writeFileSync } from "node:fs";

    const runs = 7;
    const warmup = 1;
    const commands = ["--help", "--version"];

    function run(args) {
      const samples = [];
      for (let i = 0; i < warmup; i += 1) {
        spawnSync("./dist/cia", [args], { stdio: "pipe" });
      }
      for (let i = 0; i < runs; i += 1) {
        const start = performance.now();
        const out = spawnSync("./dist/cia", [args], { stdio: "pipe" });
        if (out.status !== 0) {
          throw new Error(`Command failed: ./dist/cia ${args}`);
        }
        samples.push(Number((performance.now() - start).toFixed(2)));
      }
      const sorted = [...samples].sort((a, b) => a - b);
      const mean = samples.reduce((sum, current) => sum + current, 0) / samples.length;
      const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
      return {
        command: `./dist/cia ${args}`,
        runs,
        mean_ms: Number(mean.toFixed(2)),
        p95_ms: Number(p95.toFixed(2)),
        samples_ms: samples,
      };
    }

    const payload = {
      tool: "bun-fallback",
      generated_at: new Date().toISOString(),
      results: commands.map(run),
    };
    console.log(JSON.stringify(payload, null, 2));
    writeFileSync("./test-results/benchmarks/raw.json", JSON.stringify(payload, null, 2));
  ') | tee "${RAW_TXT}"
fi

cat >"${REPORT_MD}" <<EOF
# CLI Startup Benchmark

- binary: dist/cia
- size_bytes: ${SIZE_BYTES}
- size_human: ${SIZE_HUMAN}
- raw_json: test-results/benchmarks/raw.json
- raw_log: test-results/benchmarks/raw.txt

EOF

echo "[bench] wrote artifacts in ${BENCH_DIR}"
