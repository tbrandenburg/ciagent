# Pre-Push Hook Documentation

## Overview
The pre-push hook provides fast, essential validation before code is pushed to remote repositories. It's designed to catch common issues early while maintaining developer productivity.

## Design Principles
- **Fast**: Complete validation in under 30 seconds
- **Essential**: Only critical checks that prevent broken pushes
- **Non-blocking**: Build issues are warnings, not blockers
- **Visible**: Clear progress feedback and timing

## What It Validates

### 1. Type Checking (7-8s)
- Runs `bun run type-check` (TypeScript compilation without output)
- Catches type errors before they reach CI
- Timeout: 15 seconds

### 2. Linting (3s)
- Runs `bun run lint` (ESLint on source code)
- Enforces code style and catches common mistakes
- Timeout: 10 seconds  

### 3. Smoke Tests (5-6s)
- Runs core functionality tests only:
  - `cli.test.ts` - Main CLI interface
  - `help.test.ts` - Help command
  - `version.test.ts` - Version command  
  - `config/loader.test.ts` - Configuration loading
- Skips slow integration tests (run in CI)
- Timeout: 20 seconds

### 4. Build Smoke Test (4s)
- Attempts basic build to catch compilation issues
- **Non-blocking**: Warnings only, won't prevent push
- Skipped if validation is already taking >25s
- Timeout: 10 seconds

## Performance
- **Target**: <30 seconds
- **Typical**: 20-22 seconds  
- **Previous hook**: 120+ seconds (6x improvement)

## When It Runs
- Automatically on `git push`
- Can be bypassed with `git push --no-verify` if needed
- Does not run on `git commit` (only on push)

## Troubleshooting

### Hook Fails
1. Run the failing check manually:
   - Type issues: `make type-check`
   - Lint issues: `make lint` 
   - Test failures: `make test`
   - Build issues: `make build`

2. Fix issues locally before pushing

3. Emergency bypass: `git push --no-verify`

### Hook Takes Too Long
- Current hook auto-optimizes (skips build if >25s used)
- If consistently slow, consider reducing smoke tests
- Full validation still runs in CI

## Maintenance
- Hook location: `.githooks/pre-push`  
- Install: `make install-hooks`
- Disable: `chmod -x .githooks/pre-push`
- Re-enable: `chmod +x .githooks/pre-push`

## Philosophy
This hook follows the principle: **"Fail fast on essentials, defer comprehensive validation to CI"**

It catches the most common developer mistakes (types, lint, basic functionality) without recreating the entire CI pipeline locally.