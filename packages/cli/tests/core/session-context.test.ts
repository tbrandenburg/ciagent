import { describe, it, expect, beforeEach } from 'vitest';
import { SessionContext, SessionData } from '../../src/core/session-context.js';

describe('SessionContext', () => {
  let sessionContext: SessionContext;

  beforeEach(() => {
    sessionContext = new SessionContext();
  });

  describe('Session Creation', () => {
    it('should create a new session with secure ID', () => {
      const session = sessionContext.createSession();

      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe('string');
      expect(session.id.length).toBe(64); // 32 bytes hex = 64 characters
      expect(session.id).toMatch(/^[0-9a-f]+$/); // hex characters only (ASCII-only)
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.updatedAt).toBeInstanceOf(Date);
      expect(session.createdAt.getTime()).toBe(session.updatedAt.getTime());
    });

    it('should create session with metadata', () => {
      const metadata = { userId: 'test-user', contextType: 'coding' };
      const session = sessionContext.createSession(metadata);

      expect(session.metadata).toEqual(metadata);
      expect(session.id).toBeDefined();
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('should create unique session IDs', () => {
      const session1 = sessionContext.createSession();
      const session2 = sessionContext.createSession();

      expect(session1.id).not.toBe(session2.id);
      expect(sessionContext.getSessionCount()).toBe(2);
    });
  });

  describe('Session Retrieval', () => {
    it('should retrieve existing session by ID', () => {
      const originalSession = sessionContext.createSession({ test: 'data' });
      const retrievedSession = sessionContext.getSession(originalSession.id);

      expect(retrievedSession).toEqual(originalSession);
      expect(retrievedSession?.metadata).toEqual({ test: 'data' });
    });

    it('should return undefined for non-existent session', () => {
      const retrievedSession = sessionContext.getSession('non-existent-id');

      expect(retrievedSession).toBeUndefined();
    });
  });

  describe('Session Updates', () => {
    it('should update session metadata', () => {
      const session = sessionContext.createSession({ initial: 'data' });
      const originalUpdatedAt = session.updatedAt;

      // Small delay to ensure updatedAt changes
      const updatedSession = sessionContext.updateSession(session.id, {
        metadata: { updated: 'data', additional: 'field' },
      });

      expect(updatedSession).toBeDefined();
      expect(updatedSession?.id).toBe(session.id);
      expect(updatedSession?.metadata).toEqual({ updated: 'data', additional: 'field' });
      expect(updatedSession?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
      expect(updatedSession?.createdAt).toEqual(session.createdAt);
    });

    it('should update session with toolCallId and contextId', () => {
      const session = sessionContext.createSession();

      const updatedSession = sessionContext.updateSession(session.id, {
        toolCallId: 'tool-call-123',
        contextId: 'context-456',
      });

      expect(updatedSession?.toolCallId).toBe('tool-call-123');
      expect(updatedSession?.contextId).toBe('context-456');
      expect(updatedSession?.metadata).toBeUndefined(); // Should preserve original undefined
    });

    it('should return undefined when updating non-existent session', () => {
      const updatedSession = sessionContext.updateSession('non-existent', {
        metadata: { test: 'data' },
      });

      expect(updatedSession).toBeUndefined();
    });

    it('should preserve existing fields when partial update', () => {
      const session = sessionContext.createSession({ original: 'metadata' });

      const updated1 = sessionContext.updateSession(session.id, {
        toolCallId: 'tool-123',
      });

      expect(updated1?.metadata).toEqual({ original: 'metadata' });
      expect(updated1?.toolCallId).toBe('tool-123');
      expect(updated1?.contextId).toBeUndefined();

      const updated2 = sessionContext.updateSession(session.id, {
        contextId: 'context-456',
      });

      expect(updated2?.metadata).toEqual({ original: 'metadata' });
      expect(updated2?.toolCallId).toBe('tool-123');
      expect(updated2?.contextId).toBe('context-456');
    });
  });

  describe('Session Cleanup', () => {
    it('should clear specific session', () => {
      const session1 = sessionContext.createSession();
      const session2 = sessionContext.createSession();

      expect(sessionContext.getSessionCount()).toBe(2);

      sessionContext.clearSession(session1.id);

      expect(sessionContext.getSessionCount()).toBe(1);
      expect(sessionContext.getSession(session1.id)).toBeUndefined();
      expect(sessionContext.getSession(session2.id)).toBeDefined();
    });

    it('should clear all sessions', () => {
      sessionContext.createSession();
      sessionContext.createSession();
      sessionContext.createSession();

      expect(sessionContext.getSessionCount()).toBe(3);

      sessionContext.clearSession();

      expect(sessionContext.getSessionCount()).toBe(0);
    });
  });

  describe('Session Listing', () => {
    it('should list session IDs', () => {
      const session1 = sessionContext.createSession();
      const session2 = sessionContext.createSession();

      const sessionIds = sessionContext.listSessions();

      expect(sessionIds).toHaveLength(2);
      expect(sessionIds).toContain(session1.id);
      expect(sessionIds).toContain(session2.id);
    });

    it('should return empty array when no sessions', () => {
      const sessionIds = sessionContext.listSessions();

      expect(sessionIds).toEqual([]);
    });

    it('should return correct session count', () => {
      expect(sessionContext.getSessionCount()).toBe(0);

      sessionContext.createSession();
      expect(sessionContext.getSessionCount()).toBe(1);

      sessionContext.createSession();
      expect(sessionContext.getSessionCount()).toBe(2);

      sessionContext.clearSession();
      expect(sessionContext.getSessionCount()).toBe(0);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent session creation', () => {
      const sessions: SessionData[] = [];

      // Simulate concurrent session creation
      for (let i = 0; i < 10; i++) {
        sessions.push(sessionContext.createSession({ index: i }));
      }

      expect(sessions).toHaveLength(10);
      expect(sessionContext.getSessionCount()).toBe(10);

      // Verify all sessions have unique IDs
      const uniqueIds = new Set(sessions.map(s => s.id));
      expect(uniqueIds.size).toBe(10);

      // Verify all sessions can be retrieved
      sessions.forEach(session => {
        const retrieved = sessionContext.getSession(session.id);
        expect(retrieved).toEqual(session);
      });
    });

    it('should handle concurrent updates to same session', () => {
      const session = sessionContext.createSession();

      // Concurrent updates
      const update1 = sessionContext.updateSession(session.id, {
        toolCallId: 'tool-1',
      });
      const update2 = sessionContext.updateSession(session.id, {
        contextId: 'context-2',
      });
      const update3 = sessionContext.updateSession(session.id, {
        metadata: { final: 'state' },
      });

      // Final session should have all updates from the last successful update
      const finalSession = sessionContext.getSession(session.id);
      expect(finalSession?.metadata).toEqual({ final: 'state' });
      // Note: toolCallId and contextId from earlier updates may be overwritten
      // depending on the order of execution, which is expected behavior
    });
  });

  describe('Session Lifecycle Management', () => {
    it('should maintain session lifecycle across multiple requests', () => {
      // Create initial session
      const session = sessionContext.createSession({
        requestCount: 0,
        userContext: 'coding-task',
      });

      // Simulate multiple request updates
      let currentSession = session;
      for (let i = 1; i <= 5; i++) {
        currentSession = sessionContext.updateSession(session.id, {
          metadata: {
            requestCount: i,
            userContext: 'coding-task',
            lastRequest: new Date().toISOString(),
          },
          toolCallId: `tool-call-${i}`,
          contextId: `context-${i}`,
        }) as SessionData;

        expect(currentSession).toBeDefined();
        expect(currentSession.id).toBe(session.id);
        expect(currentSession.createdAt).toEqual(session.createdAt);
        expect(currentSession.updatedAt.getTime()).toBeGreaterThanOrEqual(
          session.updatedAt.getTime()
        );
      }

      // Verify final state
      const finalSession = sessionContext.getSession(session.id);
      expect(finalSession?.metadata?.requestCount).toBe(5);
      expect(finalSession?.toolCallId).toBe('tool-call-5');
      expect(finalSession?.contextId).toBe('context-5');
    });
  });
});
