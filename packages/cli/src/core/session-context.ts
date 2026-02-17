import crypto from 'crypto';

/**
 * Session context data structure
 */
export interface SessionData {
  readonly id: string;
  readonly createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
  toolCallId?: string;
  contextId?: string;
}

/**
 * Session context management for enhanced session tracking
 * Follows service pattern similar to ReliableAssistantChat
 */
export class SessionContext {
  private sessions: Map<string, SessionData>;

  constructor() {
    this.sessions = new Map();
  }

  /**
   * Create a new session with cryptographically secure, ASCII-only ID
   * @param metadata Optional metadata to store with the session
   * @returns SessionData for the created session
   */
  createSession(metadata?: Record<string, unknown>): SessionData {
    // Generate 32-byte cryptographically secure session ID (MCP spec requirement)
    // Use only visible ASCII characters as required by MCP specification
    const sessionId = crypto.randomBytes(32).toString('hex');

    const now = new Date();
    const sessionData: SessionData = {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      metadata,
    };

    this.sessions.set(sessionId, sessionData);
    return sessionData;
  }

  /**
   * Retrieve a session by ID
   * @param sessionId Session ID to retrieve
   * @returns SessionData if found, undefined otherwise
   */
  getSession(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update an existing session with new metadata or context information
   * @param sessionId Session ID to update
   * @param updates Updates to apply to the session
   * @returns Updated SessionData if session exists, undefined otherwise
   */
  updateSession(
    sessionId: string,
    updates: {
      metadata?: Record<string, unknown>;
      toolCallId?: string;
      contextId?: string;
    }
  ): SessionData | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const updatedSession: SessionData = {
      ...session,
      updatedAt: new Date(),
      metadata: updates.metadata !== undefined ? updates.metadata : session.metadata,
      toolCallId: updates.toolCallId !== undefined ? updates.toolCallId : session.toolCallId,
      contextId: updates.contextId !== undefined ? updates.contextId : session.contextId,
    };

    this.sessions.set(sessionId, updatedSession);
    return updatedSession;
  }

  /**
   * Clear a specific session or all sessions
   * @param sessionId Optional session ID to clear. If not provided, clears all sessions
   */
  clearSession(sessionId?: string): void {
    if (sessionId) {
      this.sessions.delete(sessionId);
    } else {
      this.sessions.clear();
    }
  }

  /**
   * Get count of active sessions
   * @returns Number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * List all active session IDs
   * @returns Array of session IDs
   */
  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

// Export a singleton instance for application use
export const sessionContext = new SessionContext();
