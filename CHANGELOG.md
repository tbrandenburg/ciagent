# Changelog

All notable changes to this project are documented in this file.

## [Unreleased] - 2026-02-21

### Added
- Multi-stage Docker packaging with non-root runtime support.
- Binary-size gate tooling: `scripts/check-binary-size.sh` and benchmark test coverage.
- Enterprise network setup guide at `docs/enterprise-network-setup.md`.

### Changed
- Build scripts split into dev/release profiles to reduce compiled binary size.
- Makefile now includes `validate-size` and `validate-docker` packaging checks.
- Release workflow now enforces size gate and Docker packaging smoke tests.
- README now includes packaging quickstart and GitHub/GitLab CI examples.

### Fixed
- Issue #8 resolution path is now measurable and fail-loud through automated size checks.

### Migration Notes
- Use `npm run build:dev` for local debug-like build output.
- Use `npm run build:release` (or `make build`) for production packaging artifacts.

### Security Notes
- Docker runtime image executes as a non-root user by default.
