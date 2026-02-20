/**
 * Tests for MCP Reliability Layer
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  withTimeout,
  retry,
  executeWithReliability,
  MCPConnectionMonitor,
  TimeoutManager,
  withGracefulDegradation,
  DEFAULT_TIMEOUT,
  connectionMonitor,
} from '../../../src/providers/mcp/reliability';

describe('MCP Reliability Layer', () => {
  describe('withTimeout', () => {
    test('resolves when promise completes before timeout', async () => {
      const result = await withTimeout(Promise.resolve('success'), 1000);
      expect(result).toBe('success');
    });

    test('rejects when promise exceeds timeout', async () => {
      const slowPromise = new Promise(resolve => setTimeout(() => resolve('too late'), 200));

      await expect(withTimeout(slowPromise, 100)).rejects.toThrow(
        'Operation timed out after 100ms'
      );
    });
  });

  describe('retry', () => {
    test('succeeds on first attempt', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      const result = await retry(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('retries transient errors', async () => {
      const failTwiceFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('network connection was lost'))
        .mockRejectedValueOnce(new Error('failed to fetch'))
        .mockResolvedValue('success');

      const result = await retry(failTwiceFn, { delay: 1, factor: 1 });

      expect(result).toBe('success');
      expect(failTwiceFn).toHaveBeenCalledTimes(3);
    });

    test('gives up after max attempts', async () => {
      const alwaysFailFn = vi.fn().mockRejectedValue(new Error('failed to fetch'));

      await expect(retry(alwaysFailFn, { attempts: 2, delay: 1 })).rejects.toThrow(
        'failed to fetch'
      );
      expect(alwaysFailFn).toHaveBeenCalledTimes(2);
    });

    test('does not retry non-transient errors', async () => {
      const nonTransientError = new Error('invalid credentials');
      const failFn = vi.fn().mockRejectedValue(nonTransientError);

      await expect(retry(failFn)).rejects.toThrow('invalid credentials');
      expect(failFn).toHaveBeenCalledTimes(1);
    });

    test('respects custom retry condition', async () => {
      const customError = new Error('custom error');
      const failFn = vi.fn().mockRejectedValue(customError);
      const shouldRetry = vi.fn().mockReturnValue(true);

      await expect(
        retry(failFn, {
          attempts: 2,
          delay: 1,
          retryIf: shouldRetry,
        })
      ).rejects.toThrow('custom error');

      expect(failFn).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledWith(customError);
    });
  });

  describe('executeWithReliability', () => {
    test('combines timeout and retry logic', async () => {
      const fastSuccessFn = vi.fn().mockResolvedValue('success');

      const result = await executeWithReliability(fastSuccessFn, {
        timeout: 1000,
        retryOptions: { attempts: 2 },
      });

      expect(result).toBe('success');
      expect(fastSuccessFn).toHaveBeenCalledTimes(1);
    });

    test('uses default timeout', async () => {
      const fastSuccessFn = vi.fn().mockResolvedValue('success');

      const result = await executeWithReliability(fastSuccessFn);

      expect(result).toBe('success');
      expect(fastSuccessFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('MCPConnectionMonitor', () => {
    let monitor: MCPConnectionMonitor;

    beforeEach(() => {
      monitor = new MCPConnectionMonitor();
    });

    afterEach(() => {
      monitor.stopMonitoring();
    });

    test('tracks connection health status', () => {
      monitor.updateHealth('server1', true);

      const health = monitor.getHealth('server1');
      expect(health).toBeDefined();
      expect(health!.connected).toBe(true);
      expect(health!.errorCount).toBe(0);
      expect(health!.lastCheck).toBeInstanceOf(Date);
    });

    test('increments error count on failures', () => {
      monitor.updateHealth('server1', false, 'connection failed');
      monitor.updateHealth('server1', false, 'timeout');

      const health = monitor.getHealth('server1');
      expect(health!.connected).toBe(false);
      expect(health!.errorCount).toBe(2);
      expect(health!.lastError).toBe('timeout');
    });

    test('tracks recovery transition after repeated failures', () => {
      monitor.updateHealth('server1', false, 'connection failed');
      monitor.updateHealth('server1', false, 'timeout');
      monitor.updateHealth('server1', true);

      const health = monitor.getHealth('server1');
      expect(health).toBeDefined();
      expect(health!.connected).toBe(true);
      expect(health!.errorCount).toBe(0);
      expect(health!.lastError).toBe('timeout');
      expect(monitor.getUnhealthyServers()).not.toContain('server1');
    });

    test('resets error count on successful connection', () => {
      monitor.updateHealth('server1', false, 'error');
      monitor.updateHealth('server1', true);

      const health = monitor.getHealth('server1');
      expect(health!.connected).toBe(true);
      expect(health!.errorCount).toBe(0);
    });

    test('determines healthy connections', () => {
      monitor.updateHealth('server1', true);
      monitor.updateHealth('server2', false);

      expect(monitor.isHealthy('server1')).toBe(true);
      expect(monitor.isHealthy('server2')).toBe(false);
    });

    test('identifies unhealthy servers', () => {
      monitor.updateHealth('server1', true);
      monitor.updateHealth('server2', false);
      monitor.updateHealth('server3', false);

      const unhealthy = monitor.getUnhealthyServers();
      expect(unhealthy).toHaveLength(2);
      expect(unhealthy).toContain('server2');
      expect(unhealthy).toContain('server3');
    });

    test('removes server health tracking', () => {
      monitor.updateHealth('server1', true);
      monitor.removeServer('server1');

      expect(monitor.getHealth('server1')).toBeUndefined();
    });

    test('gets all health status', () => {
      monitor.updateHealth('server1', true);
      monitor.updateHealth('server2', false);

      const allHealth = monitor.getAllHealth();
      expect(Object.keys(allHealth)).toHaveLength(2);
      expect(allHealth.server1.connected).toBe(true);
      expect(allHealth.server2.connected).toBe(false);
    });

    test('starts and stops monitoring', () => {
      expect(() => monitor.startMonitoring()).not.toThrow();
      expect(() => monitor.stopMonitoring()).not.toThrow();

      // Should be safe to call multiple times
      monitor.startMonitoring();
      monitor.startMonitoring();
      monitor.stopMonitoring();
      monitor.stopMonitoring();
    });

    test('keeps health summary consistent with unhealthy server list', () => {
      monitor.updateHealth('server1', true);
      monitor.updateHealth('server2', false, 'connection failed');
      monitor.updateHealth('server3', false, 'timeout');

      const allHealth = monitor.getAllHealth();
      const expectedUnhealthy = Object.keys(allHealth).filter(
        serverId => !monitor.isHealthy(serverId)
      );

      expect(monitor.getUnhealthyServers().sort()).toEqual(expectedUnhealthy.sort());
    });
  });

  describe('TimeoutManager', () => {
    let manager: TimeoutManager;

    beforeEach(() => {
      manager = new TimeoutManager();
    });

    afterEach(() => {
      manager.clearAll();
    });

    test('manages timeout lifecycle', () => {
      const callback = vi.fn();

      manager.setTimeout('test', callback, 1);
      expect(manager.hasTimeout('test')).toBe(true);

      manager.clearTimeout('test');
      expect(manager.hasTimeout('test')).toBe(false);
    });

    test('replaces existing timeout with same id', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      manager.setTimeout('test', callback1, 1000);
      manager.setTimeout('test', callback2, 1); // Replace

      expect(manager.hasTimeout('test')).toBe(true);
    });

    test('clears all timeouts', () => {
      manager.setTimeout('timeout1', vi.fn(), 1000);
      manager.setTimeout('timeout2', vi.fn(), 1000);

      manager.clearAll();

      expect(manager.hasTimeout('timeout1')).toBe(false);
      expect(manager.hasTimeout('timeout2')).toBe(false);
    });
  });

  describe('withGracefulDegradation', () => {
    test('returns operation result on success', async () => {
      const successFn = vi.fn().mockResolvedValue('success');

      const result = await withGracefulDegradation(successFn, 'default');

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('returns default value on failure', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('operation failed'));

      const result = await withGracefulDegradation(failFn, 'default');

      expect(result).toBe('default');
    });

    test('calls error handler on failure', async () => {
      const error = new Error('operation failed');
      const failFn = vi.fn().mockRejectedValue(error);
      const errorHandler = vi.fn();

      await withGracefulDegradation(failFn, 'default', {
        onError: errorHandler,
      });

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    test('applies timeout options', async () => {
      const slowFn = vi
        .fn()
        .mockImplementation(
          () => new Promise(resolve => setTimeout(() => resolve('success'), 200))
        );

      const result = await withGracefulDegradation(slowFn, 'default', {
        timeout: 100,
      });

      expect(result).toBe('default');
    });
  });

  describe('global instances', () => {
    test('connection monitor is available', () => {
      expect(connectionMonitor).toBeDefined();
    });

    test('can update global connection monitor', () => {
      connectionMonitor.updateHealth('global-test', true);

      const health = connectionMonitor.getHealth('global-test');
      expect(health).toBeDefined();
      expect(health!.connected).toBe(true);

      // Clean up
      connectionMonitor.removeServer('global-test');
    });
  });
});
