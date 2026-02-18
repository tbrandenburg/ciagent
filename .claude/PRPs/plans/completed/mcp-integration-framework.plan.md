# Implementation Plan: MCP Integration Framework

**Phase**: 7.2 - MCP integration framework  
**Status**: in-progress  
**Complexity**: MEDIUM  
**Estimated Time**: 3-4 days  

## Executive Summary

**MAJOR DISCOVERY**: Complete P0 design documents and proven MCP implementations already exist in this codebase. This plan transforms from "build from scratch" to "adapt proven implementations" approach, dramatically reducing complexity and risk.

**Reference Documents**:
- `dev/cia-agent-technical-design.md` - Complete technical architecture and MCP integration design
- `dev/opencode/packages/opencode/src/mcp/` - Production-ready MCP implementations (manager, auth, OAuth provider)

**Key Innovation**: Adapt OpenCode's sophisticated MCP manager and authentication system to work with CIA Agent's `IAssistantClient` interface while maintaining all backward compatibility.

## User Story

**AS** a developer using CIA Agent  
**I WANT** to access tools and resources from MCP-compatible servers  
**SO THAT** I can extend CIA Agent's capabilities with GitHub APIs, databases, external services, and custom tools without writing custom integrations

## Problem Statement

Current CIA Agent implementation has these limitations:
- Static tool ecosystem requiring manual integration for each new service
- No standardized protocol for external tool integration
- Limited authentication mechanisms beyond basic token-based auth
- Difficulty extending capabilities without core code changes
- Missing infrastructure for dynamic tool discovery and registration

## Solution Architecture

### Core Strategy: Adapt Proven OpenCode Implementation

**Technical Design Reference**: `dev/cia-agent-technical-design.md` provides complete blueprint
**Proven Implementation**: `dev/opencode/packages/opencode/src/mcp/` contains production-ready code

**Backward Compatibility**: The `IAssistantClient` interface remains unchanged
```typescript
export interface IAssistantClient {
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<MessageChunk>;
  getType(): string;
}
```

**Adaptation Strategy**:
1. Port OpenCode's MCP manager (`dev/opencode/packages/opencode/src/mcp/index.ts:27-938`) 
2. Adapt OAuth 2.1 PKCE authentication (`dev/opencode/packages/opencode/src/mcp/oauth-provider.ts:1-155`)
3. Integrate secure token storage (`dev/opencode/packages/opencode/src/mcp/auth.ts:1-133`)
4. Convert MCP tools to CIA Agent's tool format (following OpenCode's `convertMcpTool` pattern)

### Enhanced MessageChunk Types (From Technical Design)

```typescript
export type MessageChunk =
  | { type: 'assistant'; content: string }
  | { type: 'system'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'result'; sessionId?: string }
  | { type: 'tool'; toolName: string; toolInput?: Record<string, unknown> }
  // New MCP-specific chunks (from dev/cia-agent-technical-design.md:50-62)
  | { type: 'mcp_tool'; serverName: string; toolName: string; toolInput?: Record<string, unknown> }
  | { type: 'mcp_status'; serverName: string; status: 'connected' | 'failed' | 'needs_auth' | 'disabled' }
```

### Configuration Integration (Existing Schema + Technical Design)

The MCP configuration schema already exists in `packages/cli/src/shared/config/schema.ts:4-25`. Following the technical design and OpenCode-compatible JSON configuration format:

**Note**: Updated to match OpenCode's exact MCP configuration format with object-based server configuration and discriminated union types for local vs remote servers.

```json
// .cia/config.json (OpenCode compatible format)
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "github": {
      "type": "remote",
      "url": "https://api.github.com/mcp",
      "oauth": {
        "clientId": "your-client-id",
        "scope": "repo:read"
      },
      "timeout": 30000,
      "enabled": true
    },
    "local-git": {
      "type": "local",
      "command": "git-mcp-server",
      "args": ["--verbose"],
      "environment": {
        "GIT_MCP_DEBUG": "1"
      },
      "timeout": 15000,
      "enabled": true
    }
  }
}
```

## UX Design

### Before State
```
┌─────────────────────────────────────────────────────────────────────┐
│                         CURRENT CIA AGENT                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User Input ──► CIA Command ──► Provider API ──► Response           │
│                                                                     │
│  LIMITATIONS:                                                       │
│  • No external tool access                                         │
│  • Cannot read files, databases, or APIs                          │
│  • Isolated from enterprise systems                               │
│  • Manual data gathering required                                 │
│                                                                     │
│  DATA_FLOW: Text Input → LLM → Text Output                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### After State (MCP-Enhanced)
```
┌─────────────────────────────────────────────────────────────────────┐
│                      MCP-ENHANCED CIA AGENT                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User Input ──► Enhanced CIA Command ──► Multiple Data Sources     │
│                          │                                         │
│                          ├─► LLM Provider (Claude/Codex)           │
│                          ├─► GitHub MCP Server ──► Issues/PRs       │
│                          ├─► Database MCP Server ──► Query Results  │
│                          ├─► Custom Tools ──► Business Logic       │
│                          └─► File System ──► Project Context       │
│                                                                     │
│  CAPABILITIES:                                                      │
│  • Dynamic tool discovery                                          │
│  • OAuth 2.1 authenticated connections                             │
│  • Real-time external data access                                  │
│  • Standardized MCP protocol compliance                            │
│                                                                     │
│  DATA_FLOW: Text + Context → Enhanced LLM → Rich Response          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### 1. Port OpenCode MCP Manager
**File**: `packages/cli/src/providers/mcp/manager.ts`
**Reference**: `dev/opencode/packages/opencode/src/mcp/index.ts:27-938`
**Priority**: HIGH

**Adaptation Steps**:
- Port MCP namespace and core functionality
- Adapt OpenCode's client lifecycle management
- Replace OpenCode's `Tool` type with CIA Agent's tool format
- Integrate with existing CIA Agent error handling patterns
- Port timeout management and graceful degradation

**Key Functions to Port**:
- `status()` - Server status tracking
- `clients()` - MCP client management  
- `tools()` - Dynamic tool discovery
- `add()` - Server addition
- `connect()` / `disconnect()` - Connection management

### 2. Add Internal Bash Tool (for MCP Testing & Comparison)
**File**: `packages/cli/src/providers/tools/bash.ts` (new)
**Reference**: N/A (new internal implementation)
**Priority**: HIGH

**Implementation Steps**:
- Create internal bash tool following CIA Agent's existing tool patterns
- Implement secure command execution with timeout and sandboxing
- Add proper error handling and output formatting
- Integrate with existing provider system for baseline comparison
- Ensure compatibility with CIA Agent's `IAssistantClient` interface

**Tool Specification**:
```typescript
export interface BashTool {
  name: 'bash';
  description: 'Execute bash commands safely with timeout and error handling';
  execute(args: { command: string; timeout?: number }): Promise<BashResult>;
}

interface BashResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  timestamp: string;
}
```

**Testing Integration**:
- Verify internal bash tool works independently
- Test MCP bash tool alongside internal bash tool
- Compare outputs and performance between internal vs MCP implementations
- Ensure no naming conflicts or interference

### 3. Implement OAuth 2.1 Authentication
**File**: `packages/cli/src/providers/mcp/auth.ts`
**Reference**: `dev/opencode/packages/opencode/src/mcp/oauth-provider.ts:1-155`
**Priority**: HIGH

**Adaptation Steps**:
- Port `McpOAuthProvider` class with interface compatibility
- Adapt secure token storage from `dev/opencode/packages/opencode/src/mcp/auth.ts:1-133`
- Integrate with existing CIA Agent configuration system
- Port PKCE code verification and state management
- Add OAuth callback handling

**Security Features**:
- Code verifier generation and storage
- State parameter validation (CSRF protection)  
- Secure token persistence with encryption
- URL validation for credential security

### 4. Enhance Provider Factory
**File**: `packages/cli/src/providers/index.ts:14-36`
**Reference**: Existing provider factory pattern
**Priority**: MEDIUM

**Integration Points**:
- Register MCP manager as tool provider
- Inject MCP tools into provider context
- Add MCP status to provider health checks
- Maintain existing provider interface compatibility

### 5. Extend Configuration System
**File**: `packages/cli/src/shared/config/schema.ts:4-45`
**Reference**: `dev/cia-agent-technical-design.md:132-152`
**Priority**: MEDIUM

**Schema Extensions** (needs OAuth fields to match OpenCode format):
```typescript
// Enhanced MCP configuration to match OpenCode standards
export interface MCPServerConfig {
  name: string;
  type: 'local' | 'remote';
  // For local servers
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // For remote servers  
  url?: string;
  headers?: Record<string, string>;
  oauth?: {
    clientId?: string;
    clientSecret?: string;
    scope?: string;
  } | false;
  timeout?: number;
  enabled?: boolean;
}
```

### 6. Add MCP Commands
**File**: `packages/cli/src/commands/mcp.ts` (new)
**Reference**: `dev/cia-agent-technical-design.md:590-591` 
**Priority**: MEDIUM

**Commands to Implement**:
- `cia mcp status` - Show server connection status
- `cia mcp connect <name>` - Connect to MCP server
- `cia mcp disconnect <name>` - Disconnect from server
- `cia mcp auth <name>` - Start OAuth authentication flow
- `cia mcp tools` - List available tools from all servers

### 7. Tool Conversion Layer  
**File**: `packages/cli/src/providers/mcp/converter.ts`
**Reference**: `dev/opencode/packages/opencode/src/mcp/index.ts:120-148`
**Priority**: HIGH

**Conversion Logic**:
```typescript
export function convertMCPTool(
  mcpTool: MCPToolDefinition,
  client: MCPClient,
  serverName: string,
  timeout?: number
): Tool {
  return {
    id: `${serverName}_${mcpTool.name}`,
    description: mcpTool.description,
    execute: async (args: unknown) => {
      return withTimeout(
        client.callTool({
          name: mcpTool.name,
          arguments: args as Record<string, unknown>,
        }),
        timeout ?? DEFAULT_MCP_TIMEOUT
      )
    }
  }
}
```

### 8. Enhanced Message Processing
**File**: `packages/cli/src/providers/types.ts` (extend)
**Reference**: `dev/cia-agent-technical-design.md:49-63`
**Priority**: MEDIUM

**New MessageChunk Types**:
- `mcp_tool` - MCP tool execution requests
- `mcp_status` - Server connection status updates
- Enhanced session context with MCP tool registry

### 9. Error Handling & Timeouts
**File**: `packages/cli/src/providers/mcp/reliability.ts`  
**Reference**: `dev/opencode/packages/opencode/src/mcp/index.ts:465-487`
**Priority**: MEDIUM

**Reliability Features**:
- Connection timeout management (30s default)
- Graceful degradation when MCP servers fail
- Retry logic with exponential backoff
- Status monitoring and health checks

## Patterns to Mirror

### 1. OpenCode MCP Manager State Management
**Reference**: `dev/opencode/packages/opencode/src/mcp/index.ts:163-210`

OpenCode uses Instance-based state management with automatic cleanup:
```typescript
const state = Instance.state(
  async () => ({
    status: Record<string, Status>,
    clients: Record<string, MCPClient>
  }),
  async (state) => {
    // Cleanup on disposal
    await Promise.all(
      Object.values(state.clients).map(client => client.close())
    )
  }
)
```

**CIA Agent Adaptation**: Use existing configuration lifecycle but add MCP client cleanup.

### 2. OAuth Authentication Flow
**Reference**: `dev/opencode/packages/opencode/src/mcp/index.ts:709-894`

OpenCode's complete OAuth 2.1 PKCE flow:
1. Generate state parameter and code verifier
2. Start OAuth flow with provider auto-discovery
3. Handle redirect and callback processing
4. Token exchange and secure storage  
5. Connection establishment with authenticated transport

**CIA Agent Integration**: Port this complete flow while adapting callback handling to CLI environment.

### 3. Tool Discovery and Conversion
**Reference**: `dev/opencode/packages/opencode/src/mcp/index.ts:566-606`

OpenCode dynamically discovers tools from all connected servers and converts them to AI SDK format. 

**CIA Agent Adaptation**: Convert to CIA Agent's tool format instead, maintaining dynamic discovery.

### 4. Error Handling Patterns
**Reference**: `packages/cli/src/providers/reliability.ts:134-145`

CIA Agent already has comprehensive error handling. Extend this pattern to MCP operations:
- Timeout management  
- Retry logic
- Circuit breaker patterns
- Graceful degradation

## Dependencies

### Required Packages (From OpenCode)
```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",
  "open": "^10.0.0" // For OAuth browser opening
}
```

### MCP Configuration Schema (Existing)
- `MCPServerConfig` interface exists in `packages/cli/src/shared/config/schema.ts:4-45`
- OAuth fields need to be added to auth configuration

## Validation Commands

### 1. MCP Server Connection
```bash
cia mcp status
# Expected: Shows connection status for all configured servers

cia mcp connect github  
# Expected: Establishes connection to GitHub MCP server
```

### 2. OAuth Authentication Flow
```bash
cia mcp auth github
# Expected: Opens browser for GitHub OAuth, completes token exchange
```

### 3. Tool Discovery
```bash
cia mcp tools
# Expected: Lists all available tools from connected MCP servers
```

### 4. Tool Execution (Integration Test)
```bash
cia run "Use the GitHub tools to list recent issues in this repository"
# Expected: Uses GitHub MCP server to fetch real issue data
```

### 5. Configuration Validation
```bash
cia config show mcp
# Expected: Shows MCP server configurations and status
```

### 6. Internal vs MCP Tool Comparison Testing
```bash
# Test internal bash tool
cia run "Use the internal bash tool to run 'echo Hello from internal bash'"
# Expected: Uses internal bash tool implementation

# Test MCP bash tool  
cia run "Use the MCP bash tool to run 'echo Hello from MCP bash'"
# Expected: Uses MCP server bash tool via protocol

# Compare both implementations
cia run "Run 'pwd' using both internal and MCP bash tools and compare results"
# Expected: Shows both internal and MCP tool outputs, verifying consistency
```

## Success Criteria

### Core Functionality
- [ ] **Internal Bash Tool**: Built-in bash tool for baseline testing and comparison
- [ ] **MCP Server Management**: Connect/disconnect from MCP servers via CLI commands
- [ ] **OAuth 2.1 Authentication**: Complete PKCE flow with secure token storage
- [ ] **Dynamic Tool Discovery**: Automatically discover and register tools from connected servers
- [ ] **Tool Execution**: Execute MCP tools through existing `IAssistantClient` interface
- [ ] **Configuration Integration**: MCP servers configured via existing config system

### Integration Quality  
- [ ] **Backward Compatibility**: Existing workflows continue unchanged
- [ ] **Performance**: <100ms overhead for MCP tool discovery
- [ ] **Security**: OAuth tokens stored securely with proper encryption
- [ ] **Error Handling**: Graceful degradation when MCP servers are unavailable
- [ ] **Monitoring**: Status visibility for all configured MCP servers

### User Experience
- [ ] **Zero Breaking Changes**: Existing commands and interfaces unchanged  
- [ ] **Progressive Enhancement**: MCP features available when configured, transparent when not
- [ ] **Clear Status Feedback**: Users understand MCP server connection status
- [ ] **Easy Authentication**: One-command OAuth setup for popular servers
- [ ] **Tool Discoverability**: Users can list and understand available MCP tools

## Risk Assessment

### Reduced Risk (Due to Proven Implementations)
- **Implementation Risk**: LOW (was HIGH) - Complete working implementations exist
- **Integration Risk**: MEDIUM - Adapting to CIA Agent architecture 
- **Security Risk**: LOW - OAuth 2.1 PKCE implementation already proven
- **Performance Risk**: LOW - OpenCode implementation handles 500+ servers

### Mitigation Strategies
1. **Incremental Port**: Port one MCP component at a time with tests
2. **Isolated Testing**: Test MCP functionality separately before integration  
3. **Fallback Behavior**: System works without MCP when servers unavailable
4. **Configuration Validation**: Validate MCP configs before attempting connections

## Key Design Decisions

### 1. Preserve IAssistantClient Interface
**Decision**: Keep the core interface unchanged for backward compatibility
**Rationale**: Maintains existing integrations while adding MCP capabilities through enhanced message types

### 2. Adapt OpenCode Implementation 
**Decision**: Port proven OpenCode MCP implementation rather than building from scratch
**Rationale**: OpenCode's implementation is production-ready with 500+ server compatibility

### 3. OAuth 2.1 PKCE Standard
**Decision**: Use PKCE flow for all OAuth authentication
**Rationale**: Industry security standard, required by OpenID Connect specifications

### 4. Graceful Degradation
**Decision**: System functions normally when MCP servers are unavailable
**Rationale**: Ensures reliability and maintains user experience during server outages

---

**Next Steps**: Begin with porting the MCP manager core functionality, followed by OAuth authentication integration.

**Documentation**: `dev/cia-agent-technical-design.md` provides complete implementation checklist.