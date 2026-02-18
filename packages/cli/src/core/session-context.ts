import crypto from 'crypto';
import { SkillsManager } from '../skills/index.js';
import type { SkillsConfig } from '../shared/config/schema.js';

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
  skillsEnabled?: boolean;
}

/**
 * Session context management for enhanced session tracking
 * Follows service pattern similar to ReliableAssistantChat
 */
export class SessionContext {
  private sessions: Map<string, SessionData>;
  private skillsManager?: SkillsManager;
  private skillsManagerInitialized = false;

  constructor() {
    this.sessions = new Map();
  }

  /**
   * Lazy initialization of SkillsManager
   * Only initializes when skills functionality is needed
   * Maintains <100ms startup performance by deferring initialization
   * Called asynchronously to avoid blocking session creation
   */
  private async getSkillsManager(config?: SkillsConfig): Promise<SkillsManager> {
    if (!this.skillsManager || !this.skillsManagerInitialized) {
      this.skillsManager = new SkillsManager();
      await this.skillsManager.initialize(config || {});
      this.skillsManagerInitialized = true;
    }
    return this.skillsManager;
  }

  /**
   * Check if skills functionality is needed for a session
   * Used to conditionally initialize SkillsManager
   */
  private isSkillsNeeded(metadata?: Record<string, unknown>): boolean {
    return Boolean(metadata?.skillsEnabled || metadata?.skill);
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
      skillsEnabled: this.isSkillsNeeded(metadata),
    };

    // Initialize skills manager asynchronously if needed for this session
    // This is non-blocking to maintain <100ms startup performance
    if (sessionData.skillsEnabled && metadata?.skillsConfig) {
      this.getSkillsManager(metadata.skillsConfig as SkillsConfig).catch(error => {
        console.error(
          `Warning: Failed to initialize skills manager: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }

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

  /**
   * Get the initialized SkillsManager instance
   * @param config Optional skills configuration for lazy initialization
   * @returns SkillsManager if initialized, undefined otherwise
   */
  async getSkillsManagerInstance(config?: SkillsConfig): Promise<SkillsManager | undefined> {
    if (!this.skillsManagerInitialized && config) {
      try {
        await this.getSkillsManager(config);
        return this.skillsManager;
      } catch (error) {
        console.error(
          `Failed to initialize skills manager: ${error instanceof Error ? error.message : String(error)}`
        );
        return undefined;
      }
    }
    return this.skillsManager;
  }
}

// Export a singleton instance for application use
export const sessionContext = new SessionContext();
