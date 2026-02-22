/**
 * MCP Reliability Layer - Error Handling & Timeouts
 * Provides connection timeout management, graceful degradation, retry logic, and health monitoring
 */

// Default timeout for MCP operations (30 seconds)
export const DEFAULT_TIMEOUT = 30000;

/**
 * Retry options for MCP operations
 */
export interface RetryOptions {
  attempts?: number;
  delay?: number;
  factor?: number;
  maxDelay?: number;
  retryIf?: (error: unknown) => boolean;
}

/**
 * MCP Connection health status
 */
export interface ConnectionHealth {
  connected: boolean;
  lastCheck: Date;
  errorCount: number;
  lastError?: string;
}

/**
 * Transient error messages that indicate retryable failures
 */
const TRANSIENT_MESSAGES = [
  'load failed',
  'network connection was lost',
  'network request failed',
  'failed to fetch',
  'econnreset',
  'econnrefused',
  'etimedout',
  'socket hang up',
  'connection timeout',
  'operation timed out',
  'failed to get tools',
  'mcp server not responding',
  'proxy timeout',
  'proxy connection failed',
  'tunneling socket could not be established',
];

/**
 * Determines if an error is transient and should be retried
 */
function isTransientError(error: unknown): boolean {
  if (!error) {return false;}
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return TRANSIENT_MESSAGES.some(m => message.includes(m));
}

/**
 * Wraps a promise with a timeout
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeout: NodeJS.Timeout;
  return Promise.race([
    promise.then(result => {
      clearTimeout(timeout);
      return result;
    }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
}

/**
 * Executes a function with retry logic and exponential backoff
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    delay = 500,
    factor = 2,
    maxDelay = 10000,
    retryIf = isTransientError,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !retryIf(error)) {throw error;}

      // Calculate exponential backoff delay
      const wait = Math.min(delay * Math.pow(factor, attempt), maxDelay);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

/**
 * Executes an operation with timeout and retry logic
 */
export async function executeWithReliability<T>(
  operation: () => Promise<T>,
  options: {
    timeout?: number;
    retryOptions?: RetryOptions;
  } = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, retryOptions } = options;

  return retry(() => withTimeout(operation(), timeout), retryOptions);
}

/**
 * MCP Connection Monitor for health checks and status tracking
 */
export class MCPConnectionMonitor {
  private healthStatus = new Map<string, ConnectionHealth>();
  private monitoringInterval?: NodeJS.Timeout;
  private readonly checkInterval = 60000; // 1 minute

  /**
   * Start monitoring MCP connections
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {return;}

    this.monitoringInterval = setInterval(() => {
      this.checkAllConnections();
    }, this.checkInterval);
  }

  /**
   * Stop monitoring MCP connections
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Update health status for a connection
   */
  updateHealth(serverId: string, connected: boolean, error?: string): void {
    const current = this.healthStatus.get(serverId);

    this.healthStatus.set(serverId, {
      connected,
      lastCheck: new Date(),
      errorCount: connected ? 0 : (current?.errorCount || 0) + 1,
      lastError: error || current?.lastError,
    });
  }

  /**
   * Get health status for a specific server
   */
  getHealth(serverId: string): ConnectionHealth | undefined {
    return this.healthStatus.get(serverId);
  }

  /**
   * Get health status for all servers
   */
  getAllHealth(): Record<string, ConnectionHealth> {
    const result: Record<string, ConnectionHealth> = {};
    for (const [serverId, health] of this.healthStatus.entries()) {
      result[serverId] = health;
    }
    return result;
  }

  /**
   * Remove health status for a server
   */
  removeServer(serverId: string): void {
    this.healthStatus.delete(serverId);
  }

  /**
   * Check if a server connection is healthy
   */
  isHealthy(serverId: string): boolean {
    const health = this.healthStatus.get(serverId);
    if (!health) {return false;}

    // Consider unhealthy if error count exceeds threshold or last check was too long ago
    const maxErrors = 3;
    const maxAge = 5 * 60 * 1000; // 5 minutes

    return (
      health.connected &&
      health.errorCount < maxErrors &&
      Date.now() - health.lastCheck.getTime() < maxAge
    );
  }

  /**
   * Get list of unhealthy servers
   */
  getUnhealthyServers(): string[] {
    const unhealthy: string[] = [];
    for (const [serverId] of this.healthStatus.entries()) {
      if (!this.isHealthy(serverId)) {
        unhealthy.push(serverId);
      }
    }
    return unhealthy;
  }

  private checkAllConnections(): void {
    // This method would be called by the MCP manager to perform health checks
    // Implementation depends on how the manager wants to handle health checks
    // For now, we just clean up old entries
    const maxAge = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    for (const [serverId, health] of this.healthStatus.entries()) {
      if (now - health.lastCheck.getTime() > maxAge) {
        this.healthStatus.delete(serverId);
      }
    }
  }
}

/**
 * Graceful degradation helper - returns a default value when MCP operation fails
 */
export async function withGracefulDegradation<T>(
  operation: () => Promise<T>,
  defaultValue: T,
  options: {
    timeout?: number;
    retryOptions?: RetryOptions;
    onError?: (error: unknown) => void;
  } = {}
): Promise<T> {
  try {
    return await executeWithReliability(operation, {
      timeout: options.timeout,
      retryOptions: options.retryOptions,
    });
  } catch (error) {
    options.onError?.(error);
    return defaultValue;
  }
}

/**
 * Connection timeout manager for managing multiple timeouts
 */
export class TimeoutManager {
  private timeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Set a timeout for an operation
   */
  setTimeout(id: string, callback: () => void, delay: number): void {
    this.clearTimeout(id);
    const timeout = setTimeout(callback, delay);
    this.timeouts.set(id, timeout);
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(id: string): void {
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }
  }

  /**
   * Clear all timeouts
   */
  clearAll(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }

  /**
   * Check if a timeout exists
   */
  hasTimeout(id: string): boolean {
    return this.timeouts.has(id);
  }
}

// Global instances for shared use
export const connectionMonitor = new MCPConnectionMonitor();
export const timeoutManager = new TimeoutManager();

// Start monitoring by default
connectionMonitor.startMonitoring();
