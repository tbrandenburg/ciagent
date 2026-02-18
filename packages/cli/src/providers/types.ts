// Enhanced message chunk types following the technical design
export type MessageChunk =
  | { type: 'assistant'; content: string; sessionId?: string; contextId?: string }
  | { type: 'system'; content: string; sessionId?: string; contextId?: string }
  | { type: 'thinking'; content: string; sessionId?: string; contextId?: string }
  | { type: 'result'; sessionId?: string; contextId?: string }
  | { type: 'error'; content: string; sessionId?: string; contextId?: string }
  | {
      type: 'tool';
      toolName: string;
      toolInput?: Record<string, unknown>;
      toolCallId?: string;
      sessionId?: string;
      contextId?: string;
    }
  // MCP-specific message chunks
  | {
      type: 'mcp_tool';
      serverName: string;
      toolName: string;
      toolInput?: Record<string, unknown>;
      toolCallId?: string;
      sessionId?: string;
      contextId?: string;
    }
  | {
      type: 'mcp_status';
      serverName: string;
      status: 'connected' | 'failed' | 'needs_auth' | 'disabled' | 'connecting';
      sessionId?: string;
      contextId?: string;
    }
  // Aggregate status message chunks for orchestration
  | {
      type: 'mcp_aggregate_status';
      serverCount: number;
      connectedServers: number;
      toolCount: number;
      availableTools: string[];
      sessionId?: string;
      contextId?: string;
    }
  | {
      type: 'skills_status';
      skillsLoaded: number;
      availableSkills: string[];
      activeSkill?: string;
      sessionId?: string;
      contextId?: string;
    }
  | {
      type: 'orchestration_status';
      mcpAvailable: boolean;
      skillsAvailable: boolean;
      capabilities: string[];
      sessionId?: string;
      contextId?: string;
    };

// Legacy ChatChunk interface for backward compatibility
export interface ChatChunk {
  type:
    | 'assistant'
    | 'result'
    | 'system'
    | 'tool'
    | 'thinking'
    | 'error'
    | 'mcp_tool'
    | 'mcp_status'
    | 'mcp_aggregate_status'
    | 'skills_status'
    | 'orchestration_status';
  content?: string;
  sessionId?: string;
  toolName?: string;
  // Enhanced fields for tool calling and metadata
  toolCallId?: string;
  metadata?: Record<string, any>;
  contextId?: string;
  // MCP-specific fields
  serverName?: string;
  toolInput?: Record<string, unknown>;
  status?: 'connected' | 'failed' | 'needs_auth' | 'disabled' | 'connecting';
  // Status aggregation fields
  serverCount?: number;
  connectedServers?: number;
  toolCount?: number;
  availableTools?: string[];
  skillsLoaded?: number;
  availableSkills?: string[];
  activeSkill?: string;
  mcpAvailable?: boolean;
  skillsAvailable?: boolean;
  capabilities?: string[];
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface IAssistantChat {
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  sendQuery(messages: Message[], cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  getType(): string;
  listModels(): Promise<string[]>;
}

// Utility functions for creating message chunks

/**
 * Create an MCP tool execution message chunk
 */
export function createMCPToolChunk(
  serverName: string,
  toolName: string,
  toolInput?: Record<string, unknown>,
  options?: {
    toolCallId?: string;
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'mcp_tool',
    serverName,
    toolName,
    toolInput,
    ...options,
  };
}

/**
 * Create an MCP status update message chunk
 */
export function createMCPStatusChunk(
  serverName: string,
  status: 'connected' | 'failed' | 'needs_auth' | 'disabled' | 'connecting',
  options?: {
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'mcp_status',
    serverName,
    status,
    ...options,
  };
}

/**
 * Create an MCP aggregate status message chunk
 */
export function createMCPAggregateStatusChunk(
  serverCount: number,
  connectedServers: number,
  toolCount: number,
  availableTools: string[],
  options?: {
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'mcp_aggregate_status',
    serverCount,
    connectedServers,
    toolCount,
    availableTools,
    ...options,
  };
}

/**
 * Create a Skills status message chunk
 */
export function createSkillsStatusChunk(
  skillsLoaded: number,
  availableSkills: string[],
  activeSkill?: string,
  options?: {
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'skills_status',
    skillsLoaded,
    availableSkills,
    activeSkill,
    ...options,
  };
}

/**
 * Create an orchestration status message chunk
 */
export function createOrchestrationStatusChunk(
  mcpAvailable: boolean,
  skillsAvailable: boolean,
  capabilities: string[],
  options?: {
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'orchestration_status',
    mcpAvailable,
    skillsAvailable,
    capabilities,
    ...options,
  };
}

/**
 * Create a standard tool execution message chunk
 */
export function createToolChunk(
  toolName: string,
  toolInput?: Record<string, unknown>,
  options?: {
    toolCallId?: string;
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'tool',
    toolName,
    toolInput,
    ...options,
  };
}

/**
 * Create an assistant content message chunk
 */
export function createAssistantChunk(
  content: string,
  options?: {
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'assistant',
    content,
    ...options,
  };
}

/**
 * Create a system message chunk
 */
export function createSystemChunk(
  content: string,
  options?: {
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'system',
    content,
    ...options,
  };
}

/**
 * Create an error message chunk
 */
export function createErrorChunk(
  content: string,
  options?: {
    sessionId?: string;
    contextId?: string;
  }
): MessageChunk {
  return {
    type: 'error',
    content,
    ...options,
  };
}

/**
 * Type guard to check if a message chunk is an MCP tool chunk
 */
export function isMCPToolChunk(
  chunk: MessageChunk
): chunk is Extract<MessageChunk, { type: 'mcp_tool' }> {
  return chunk.type === 'mcp_tool';
}

/**
 * Type guard to check if a message chunk is an MCP status chunk
 */
export function isMCPStatusChunk(
  chunk: MessageChunk
): chunk is Extract<MessageChunk, { type: 'mcp_status' }> {
  return chunk.type === 'mcp_status';
}

/**
 * Type guard to check if a message chunk is an MCP aggregate status chunk
 */
export function isMCPAggregateStatusChunk(
  chunk: MessageChunk
): chunk is Extract<MessageChunk, { type: 'mcp_aggregate_status' }> {
  return chunk.type === 'mcp_aggregate_status';
}

/**
 * Type guard to check if a message chunk is a Skills status chunk
 */
export function isSkillsStatusChunk(
  chunk: MessageChunk
): chunk is Extract<MessageChunk, { type: 'skills_status' }> {
  return chunk.type === 'skills_status';
}

/**
 * Type guard to check if a message chunk is an orchestration status chunk
 */
export function isOrchestrationStatusChunk(
  chunk: MessageChunk
): chunk is Extract<MessageChunk, { type: 'orchestration_status' }> {
  return chunk.type === 'orchestration_status';
}

/**
 * Type guard to check if a message chunk is any status-related chunk
 */
export function isStatusChunk(
  chunk: MessageChunk
): chunk is Extract<
  MessageChunk,
  { type: 'mcp_status' | 'mcp_aggregate_status' | 'skills_status' | 'orchestration_status' }
> {
  return (
    chunk.type === 'mcp_status' ||
    chunk.type === 'mcp_aggregate_status' ||
    chunk.type === 'skills_status' ||
    chunk.type === 'orchestration_status'
  );
}

/**
 * Type guard to check if a message chunk is any MCP-related chunk
 */
export function isMCPChunk(
  chunk: MessageChunk
): chunk is Extract<MessageChunk, { type: 'mcp_tool' | 'mcp_status' | 'mcp_aggregate_status' }> {
  return (
    chunk.type === 'mcp_tool' ||
    chunk.type === 'mcp_status' ||
    chunk.type === 'mcp_aggregate_status'
  );
}

/**
 * Convert a legacy ChatChunk to the new MessageChunk format
 */
export function convertChatChunkToMessageChunk(chatChunk: ChatChunk): MessageChunk {
  switch (chatChunk.type) {
    case 'assistant':
      return {
        type: 'assistant',
        content: chatChunk.content || '',
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'system':
      return {
        type: 'system',
        content: chatChunk.content || '',
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'thinking':
      return {
        type: 'thinking',
        content: chatChunk.content || '',
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'result':
      return {
        type: 'result',
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'error':
      return {
        type: 'error',
        content: chatChunk.content || '',
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'tool':
      return {
        type: 'tool',
        toolName: chatChunk.toolName || '',
        toolInput: chatChunk.metadata,
        toolCallId: chatChunk.toolCallId,
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'mcp_tool':
      return {
        type: 'mcp_tool',
        serverName: chatChunk.serverName || '',
        toolName: chatChunk.toolName || '',
        toolInput: chatChunk.toolInput,
        toolCallId: chatChunk.toolCallId,
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'mcp_status':
      return {
        type: 'mcp_status',
        serverName: chatChunk.serverName || '',
        status: chatChunk.status || 'disabled',
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'mcp_aggregate_status':
      return {
        type: 'mcp_aggregate_status',
        serverCount: chatChunk.serverCount || 0,
        connectedServers: chatChunk.connectedServers || 0,
        toolCount: chatChunk.toolCount || 0,
        availableTools: chatChunk.availableTools || [],
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'skills_status':
      return {
        type: 'skills_status',
        skillsLoaded: chatChunk.skillsLoaded || 0,
        availableSkills: chatChunk.availableSkills || [],
        activeSkill: chatChunk.activeSkill,
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    case 'orchestration_status':
      return {
        type: 'orchestration_status',
        mcpAvailable: chatChunk.mcpAvailable || false,
        skillsAvailable: chatChunk.skillsAvailable || false,
        capabilities: chatChunk.capabilities || [],
        sessionId: chatChunk.sessionId,
        contextId: chatChunk.contextId,
      };
    default:
      throw new Error(`Unknown chat chunk type: ${(chatChunk as any).type}`);
  }
}
