#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY_PATH="${BINARY_PATH:-${ROOT_DIR}/dist/cia}"
MAX_SIZE_BYTES="${MAX_SIZE_BYTES:-125829120}"

if [[ ! -f "${BINARY_PATH}" ]]; then
  echo "[size] error: binary not found at ${BINARY_PATH}" >&2
  exit 1
fi

if stat -c%s "${BINARY_PATH}" >/dev/null 2>&1; then
  SIZE_BYTES="$(stat -c%s "${BINARY_PATH}")"
elif stat -f%z "${BINARY_PATH}" >/dev/null 2>&1; then
  SIZE_BYTES="$(stat -f%z "${BINARY_PATH}")"
else
  echo "[size] error: unable to determine file size for ${BINARY_PATH}" >&2
  exit 1
fi

if [[ "${SIZE_BYTES}" -gt "${MAX_SIZE_BYTES}" ]]; then
  echo "[size] error: ${BINARY_PATH} is ${SIZE_BYTES} bytes, exceeds limit ${MAX_SIZE_BYTES} bytes" >&2
  exit 1
fi

echo "[size] ok: ${BINARY_PATH} is ${SIZE_BYTES} bytes (limit ${MAX_SIZE_BYTES})"
