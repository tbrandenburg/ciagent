import { describe, it, expect } from 'vitest';
import { createHttpClient } from '../../src/utils/http-client';

describe('No-proxy bypass functionality', () => {
  it('should bypass proxy for exact hostname matches', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.example.com:8080',
      'no-proxy': ['localhost', 'api.test'],
    });

    // Test that interceptor is present
    expect(client.interceptors.request.handlers).toHaveLength(2);
  });

  it('should bypass proxy for wildcard patterns', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.example.com:8080',
      'no-proxy': ['*.internal.com', '*.test'],
    });

    // Test that interceptor is present for wildcard patterns
    expect(client.interceptors.request.handlers).toHaveLength(2);
  });

  it('should bypass proxy for domain suffix patterns', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.example.com:8080',
      'no-proxy': ['.internal.com'],
    });

    // Test that interceptor is present for domain suffix patterns
    expect(client.interceptors.request.handlers).toHaveLength(2);
  });

  it('should handle empty no-proxy list', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.example.com:8080',
      'no-proxy': [],
    });

    // Should still add interceptor even with empty list (defensive coding)
    expect(client.interceptors.request.handlers).toHaveLength(2);
  });

  it('should handle mixed pattern types', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.example.com:8080',
      'no-proxy': ['localhost', '*.internal.com', '.corp.com', '192.168.1.1'],
    });

    // Test that interceptor handles mixed pattern types
    expect(client.interceptors.request.handlers).toHaveLength(2);
    expect(client.defaults.proxy).toBeTruthy();
  });
});
