#!/usr/bin/env sh
set -eu

cd "$(git rev-parse --show-toplevel)"

if [ ! -d .githooks ]; then
  echo "missing .githooks directory"
  exit 1
fi

if [ ! -x .githooks/pre-push ]; then
  chmod +x .githooks/pre-push
fi

git config core.hooksPath .githooks

echo "Configured Git hooks path to .githooks"
