import { describe, it, expect } from 'vitest';
import { createHttpClient } from '../../src/utils/http-client';

describe('Proxy Integration Tests', () => {
  it('should configure no-proxy bypass functionality', () => {
    // Test configuration with no-proxy list
    const client = createHttpClient({
      'http-proxy': 'http://mock-proxy:8080',
      'no-proxy': ['localhost', '*.internal.com'],
    });

    // Verify proxy is configured
    expect(client.defaults.proxy).toBeTruthy();
    expect(client.defaults.proxy).not.toBe(false);

    const proxyConfig = client.defaults.proxy as any;
    expect(proxyConfig.host).toBe('mock-proxy');

    // Verify no-proxy interceptor is added
    expect(client.interceptors.request.handlers).toHaveLength(2); // no-proxy + logging
  });

  it('should handle proxy configuration without no-proxy', () => {
    const client = createHttpClient({
      'http-proxy': 'http://mock-proxy:8080',
    });

    // Should only have logging interceptor when no no-proxy is configured
    expect(client.interceptors.request.handlers).toHaveLength(1); // only logging

    const proxyConfig = client.defaults.proxy as any;
    expect(proxyConfig.host).toBe('mock-proxy');
  });

  it('should use HTTPS proxy for secure connections', () => {
    const client = createHttpClient({
      'http-proxy': 'http://http-proxy:8080',
      'https-proxy': 'https://https-proxy:8443',
    });

    // Should prefer HTTPS proxy
    expect(client.defaults.proxy).toEqual({
      host: 'https-proxy',
      port: 8443,
      protocol: 'https',
      auth: undefined,
    });
  });

  it('should handle malformed proxy URLs gracefully', () => {
    // This should throw during URL parsing
    expect(() => {
      createHttpClient({
        'http-proxy': 'not-a-valid-url',
      });
    }).toThrow();
  });

  it('should handle proxy URLs without ports', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.company.com',
    });

    // Should default to port 8080 for HTTP
    const proxyConfig = client.defaults.proxy as any;
    expect(proxyConfig.port).toBe(8080);
  });

  it('should preserve proxy authentication credentials', () => {
    const client = createHttpClient({
      'https-proxy': 'https://admin:secret123@corporate-proxy.company.com:8443',
    });

    const proxyConfig = client.defaults.proxy as any;
    expect(proxyConfig.auth).toEqual({
      username: 'admin',
      password: 'secret123',
    });
    expect(proxyConfig.host).toBe('corporate-proxy.company.com');
  });
});
