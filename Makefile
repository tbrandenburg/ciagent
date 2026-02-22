.PHONY: help install build test test-coverage clean dev lint type-check global-install benchmark validate-bench validate-size validate-docker
.DEFAULT_GOAL := help

BINDIR ?= $(HOME)/.local/bin

# Colors for help text
YELLOW := \033[33m
BLUE := \033[34m
RESET := \033[0m

help: ## Show this help message
	@echo "$(BLUE)ciagent - Vendor-neutral AI agent CLI tool$(RESET)"
	@echo ""
	@echo "$(YELLOW)Available targets:$(RESET)"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(YELLOW)%-12s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	bun install

type-check: ## Run TypeScript type checking
	bun run type-check

lint: ## Run linting
	bun run lint

test: ## Run all tests
	npm run test

test-coverage: ## Run tests with coverage report
	npm run test:coverage

build: ## Build CLI binary
	bun run build

global-install: build ## Install cia binary to $(BINDIR) (user-local)
	install -d "$(BINDIR)"
	install -m 755 dist/cia "$(BINDIR)/cia"

dev: ## Run CLI in development mode
	bun run dev:cli

clean: ## Clean build artifacts
	rm -rf dist/ coverage/ node_modules/.cache/

# Validation commands from plan
validate-l1: ## Level 1: Static analysis
	bun run type-check && bun run lint

validate-l2: ## Level 2: Unit tests  
	npx vitest --run

validate-l3: ## Level 3: Full suite
	npx vitest --run && bun run build

validate-l4: ## Level 4: Binary validation
	bun run build
	./dist/cia --help
	./dist/cia --version

benchmark: ## Run CLI startup benchmark and collect metrics
	bash scripts/benchmarks/run-cli-startup.sh
	bun scripts/benchmarks/collect-metrics.ts --input test-results/benchmarks/raw.json --output test-results/benchmarks/summary.json

validate-bench: ## Validate benchmark tests and benchmark harness
	npx vitest --run packages/cli/tests/benchmarks/*.test.ts
	$(MAKE) benchmark

validate-size: ## Validate compiled binary size budget
	$(MAKE) build
	bash scripts/check-binary-size.sh

validate-docker: ## Validate Docker packaging and runtime smoke test
	@command -v docker >/dev/null 2>&1 || (echo "docker is required for validate-docker" >&2 && exit 1)
	docker build -t ciagent:latest .
	docker run --rm ciagent:latest cia --version

validate-all: validate-l1 validate-l2 validate-l3 validate-l4 validate-size ## Run all validation levels

# Development workflow
dev-setup: install install-hooks ## Set up development environment
	@echo "$(BLUE)Development environment ready!$(RESET)"
	@echo "Try: make dev"

install-hooks: ## Install Git pre-push hook
	./scripts/install-hooks.sh

ci: validate-all ## Run CI validation pipeline
	@echo "$(BLUE)All CI checks passed!$(RESET)"

ci-full: ## Run CI with gated E2E/integration tests enabled
	RUN_E2E_TESTS=1 RUN_INTEGRATION_TESTS=1 RUN_REAL_CODEX_E2E=1 $(MAKE) ci
