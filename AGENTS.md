# AGENTS.md

## Mandatory rules

- Keep it very simple: Do not overengineer. Keep it bloody simple. Each file shall be perceivable, explainable and easily browsable
- DRY: Do not repeat yourself
- YAGNI: Avoid features apart from core behaviour
- Boy-scout rule: Always leave the campground cleaner as it was before! If tests fail, care about them! No matter if you touched them or not!
- Fail loud and early! Prevent fall-backs and silent failures
- Never skip tests!
- Keep test suites lean for CI performance: Prefer a low number of high-signal tests that catch real regressions over many repetitive low-value tests
- Strive for quality! Linting and testing have to pass!

## Project Structure

```
ciagent/
├── packages/cli/          # Main CLI package
│   ├── src/
│   │   ├── commands/      # Command implementations
│   │   ├── providers/     # LLM provider integrations
│   │   ├── shared/        # Shared utilities
│   │   │   ├── config/    # Configuration management
│   │   │   ├── errors/    # Error handling & exit codes
│   │   │   └── validation/ # Input validation
│   │   └── utils/         # General utilities
│   └── tests/             # Test suite (Vitest)
│       ├── commands/      # Command-specific tests
│       ├── config/        # Configuration tests
│       └── utils/         # Utility tests
├── dev/                   # Temprorary Development Files (gitignored)
├── docs/                  # Documentation
├── scripts/               # Build & utility scripts
└── dist/                  # Built binary output
```

### Architecture Overview

- **packages/cli/src/commands/** - User-facing CLI commands (run, help, version, models)
- **packages/cli/src/providers/** - LLM provider abstractions (Codex, Claude, reliability layer)
- **packages/cli/src/shared/** - Core shared functionality (config loading, error handling, validation)
- **packages/cli/tests/** - Comprehensive test coverage (84 tests) matching src structure

## Tech Stack

- Runtime & Core
  - Bun (runtime and package manager)
  - TypeScript
  - Commander.js (CLI framework)

- AI/LLM Integration

  - Codex SDK
  - Claude SDK (Anthropic)
  - Vercel AI SDK (@ai-sdk/azure for Azure OpenAI)
  - Model Context Protocol (MCP) support
  - Support of skills

- Testing & Quality

  - Vitest (testing framework)
  - Contract testing for provider reliability

- DevOps & Packaging

  - Bun binary compilation
  - GitHub Actions (CI/CD)
  - Makefile (build automation)

## References

- More details in [PRD](.claude/PRPs/prds/ciagent-cli-tool.prd.md)
