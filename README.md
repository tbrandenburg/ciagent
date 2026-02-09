# ciagent

Vendor-neutral AI agent CLI tool for CI/CD pipelines.

> **Status**: Phase 1 Complete ✅ - CI/CD pipeline, testing, and binary compilation working

## Quick Start

```bash
# Set up development environment
make dev-setup

# Run tests
make test

# Build CLI binary
make build

# Run full CI validation
make ci
```

## Development Workflow

The project includes automated quality gates:

- **GitHub Actions**: Runs `make ci` on PR creation, merges to main, and manual dispatch
- **Pre-push Hook**: Runs `make ci` before every git push to prevent broken builds
- **CI Pipeline**: Validates TypeScript, runs tests, builds binary, and verifies functionality

### Available Make Targets

Run `make help` to see all available targets including:
- `make ci` - Complete CI validation pipeline  
- `make test-coverage` - Run tests with coverage report
- `make install-hooks` - Install Git pre-push hook
- `make validate-all` - Run all validation levels from plan

## Architecture

This is Phase 1 of the ciagent implementation, providing the core CLI scaffold with:
- TypeScript + Bun runtime
- Complete CLI argument parsing and validation  
- Configuration hierarchy (CLI > repo > user > env)
- Comprehensive test suite (89.73% coverage)
- Binary compilation for distribution
