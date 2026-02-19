# ciagent

Vendor-neutral AI agent CLI tool for CI/CD pipelines.

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

# Run CLI scaffold commands
bun packages/cli/src/cli.ts --help
bun packages/cli/src/cli.ts --version
bun packages/cli/src/cli.ts run "test"
bun packages/cli/src/cli.ts models
```

## Setup Guide

### Prerequisites

1. **Install Dependencies**
   ```bash
   make dev-setup
   make build
   ```

2. **Create Configuration Directory**
   ```bash
   mkdir -p ~/.cia
   ```

### Context7 MCP Support

Enable Context7 MCP for enhanced documentation queries and code analysis:

```bash
# Create configuration with Context7 MCP
cat > ~/.cia/config.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "codex/gpt-5.3-codex",
  "mcp": {
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp"],
      "enabled": true
    }
  }
}
EOF

# Test Context7 connection
cia mcp status

# List available Context7 tools
cia mcp tools

# Example: Add Context7 MCP server manually (if not in config)
cia mcp add context7 "npx -y @upstash/context7-mcp"

# Run a prompt with Context7
cia run "Help me understand this code" --context myfile.js
```

### PDF Skills Support

Enable PDF processing skills for document analysis:

```bash
# Create skills directories
mkdir -p ~/.cia/skills
mkdir -p ~/.claude/skills  # OpenCode compatibility

# Update config to include skills support
cat > ~/.cia/config.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "codex/gpt-5.3-codex",
  "skills": {
    "sources": [
      {
        "name": "global-skills",
        "type": "local",
        "path": "~/.cia/skills",
        "enabled": true
      }
    ]
  }
}
EOF

# Check available skills
cia skills list

# Search for PDF skills
cia skills search "pdf"

# Install PDF skills (example)
cia skills install pdf-reader              # from registry
cia skills install user/pdf-skills         # from GitHub

# Check skills system status
cia skills status

# Run a prompt with PDF skill
cia run "Process this PDF document" --skill pdf-reader --context document.pdf
```

### Complete Configuration (MCP + Skills)

For both Context7 MCP and Skills support:

```bash
# Combined configuration
cat > ~/.cia/config.json << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "codex/gpt-5.3-codex",
  "mcp": {
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp"],
      "enabled": true
    }
  },
  "skills": {
    "sources": [
      {
        "name": "global-skills",
        "type": "local",
        "path": "~/.cia/skills",
        "enabled": true
      }
    ]
  }
}
EOF

# Verify both features are working
cia mcp status
cia skills status
```

## Advanced Usage Examples

### MCP Server Management

```bash
# Add a local MCP server
cia mcp add my-server "npx my-mcp-server"

# Add a remote MCP server
cia mcp add remote-server "https://api.example.com/mcp"

# List all configured servers
cia mcp list

# Get detailed information about a specific server
cia mcp get my-server

# Check server health and diagnostics
cia mcp status

# List all available tools from connected servers
cia mcp tools

# Remove a server configuration
cia mcp remove my-server
```

### Skills Management (SkillCreator AI Compatible)

```bash
# Install skills from different sources
cia skills install frontend-design              # from registry
cia skills install anthropics/skills            # from GitHub repo
cia skills install git@github.com:user/skill.git # from git URL  
cia skills install ./my-skill                   # from local path

# List available skills with OpenCode formatting
cia skills list

# Search for specific skills
cia skills search "code review"
cia skills search frontend

# Get detailed information about a skill
cia skills info git-release

# Update skills
cia skills update frontend-design               # update specific skill
cia skills update all                          # update all skills

# Remove installed skills
cia skills uninstall frontend-design

# Refresh skills discovery
cia skills refresh

# Check skills system status
cia skills status
```

### Agent Capability Discovery

The CLI now provides comprehensive capability inventory when you ask about available tools:

```bash
# Get complete inventory of tools and skills
cia run "What tools and skills do you have?"

# Query specific capabilities  
cia run "What can you do?"
cia run "List your capabilities"
cia run "Show me available functionality"
```

### Skill Discovery Locations

Skills are automatically discovered from these locations:

```bash
# Global CIA-native skills
~/.cia/skills/           # CIA-native global skills
~/.config/cia/skills/    # XDG config directory

# OpenCode-compatible skills  
~/.claude/skills/        # OpenCode-compatible global skills
~/.opencode/skills/      # OpenCode skills directory
~/.config/opencode/skills/ # XDG OpenCode config

# Agent-compatible skills
~/.agents/skills/        # Agent-compatible skills

# Project-level skills (override global ones)
.cia/skills/             # Project CIA skills
.claude/skills/          # Project OpenCode skills
.agents/skills/          # Project agent skills
```

### Available Commands

| Command | Description |
|---------|-------------|
| `cia run <prompt>` | Execute AI prompt with optional context |
| `cia models` | List available AI models |
| **MCP Server Management** |
| `cia mcp list` | List configured MCP servers |
| `cia mcp add <name> <url-or-command>` | Add new MCP server |
| `cia mcp get <server>` | Get detailed server information |
| `cia mcp remove <server>` | Remove MCP server configuration |
| `cia mcp status` | Show MCP server health diagnostics |
| `cia mcp tools` | List available MCP tools |
| **Skills Management** |
| `cia skills list` | Show available skills with OpenCode-style formatting |
| `cia skills install <source>` | Install skill from registry, GitHub repo, git URL, or local path |
| `cia skills uninstall <name>` | Remove installed skill |
| `cia skills update <name\|all>` | Update specific skill or all skills |
| `cia skills info <skill>` | Show detailed skill information including location |
| `cia skills search <query>` | Search skills by name/tags/metadata |
| `cia skills refresh` | Reload skills from all sources |
| `cia skills status` | Show skill sources and discovery status |
| `cia --help` | Show complete command reference |

### Configuration Hierarchy

CIA CLI uses this configuration priority order:
1. CLI flags (highest priority)
2. Repository config (`.cia/config.json`)
3. User config (`~/.cia/config.json`)
4. Environment variables (lowest priority)

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
- `run` and `models` command surface
- Codex-first chat integration via `IAssistantChat`
- Comprehensive test suite (89.73% coverage)
- Binary compilation for distribution
