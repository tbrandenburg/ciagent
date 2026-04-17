import { describe, it, expect } from 'vitest';
import { createHttpClient } from '../../src/utils/http-client';

describe('HTTP Client Proxy Configuration', () => {
  it('should configure HTTP proxy correctly', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.company.com:8080',
    });

    // The proxy config is now internal to axios, let's test the client exists and has the expected structure
    expect(client).toBeDefined();
    expect(typeof client.request).toBe('function');
    expect(typeof client.get).toBe('function');

    // Test that proxy config was applied (via the defaults.proxy property)
    expect(client.defaults.proxy).toEqual({
      host: 'proxy.company.com',
      port: 8080,
      protocol: 'http',
      auth: undefined,
    });
  });

  it('should configure HTTPS proxy correctly', () => {
    const client = createHttpClient({
      'https-proxy': 'https://secure-proxy.company.com:8443',
    });

    expect(client.defaults.proxy).toEqual({
      host: 'secure-proxy.company.com',
      port: 8443,
      protocol: 'https',
      auth: undefined,
    });
  });

  it('should prefer HTTPS proxy when both are configured', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.company.com:8080',
      'https-proxy': 'https://secure-proxy.company.com:8443',
    });

    expect(client.defaults.proxy).toEqual({
      host: 'secure-proxy.company.com',
      port: 8443,
      protocol: 'https',
      auth: undefined,
    });
  });

  it('should handle no-proxy configuration', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.company.com:8080',
      'no-proxy': ['localhost', '*.internal.com'],
    });

    // Check that proxy is configured by default
    expect(client.defaults.proxy).toEqual({
      host: 'proxy.company.com',
      port: 8080,
      protocol: 'http',
      auth: undefined,
    });

    // Test that no-proxy interceptor is added when no-proxy is configured
    expect(client.interceptors.request.handlers).toHaveLength(2); // no-proxy + logging interceptors
  });

  it('should not add no-proxy interceptor when no no-proxy configuration', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.company.com:8080',
    });

    // Should only have the logging interceptor, not the no-proxy interceptor
    expect(client.interceptors.request.handlers).toHaveLength(1); // only logging interceptor
  });

  it('should handle proxy authentication', () => {
    const client = createHttpClient({
      'http-proxy': 'http://user:pass@proxy.company.com:8080',
    });

    const proxyConfig = client.defaults.proxy as any;
    expect(proxyConfig.auth).toEqual({
      username: 'user',
      password: 'pass',
    });
  });

  it('should return false when no proxies configured', () => {
    const client = createHttpClient({});

    expect(client.defaults.proxy).toBe(false);
  });

  it('should return false when networkConfig is undefined', () => {
    const client = createHttpClient();

    expect(client.defaults.proxy).toBe(false);
  });

  it('should use default ports correctly', () => {
    const httpClient = createHttpClient({
      'http-proxy': 'http://proxy.company.com',
    });

    const httpProxyConfig = httpClient.defaults.proxy as any;
    expect(httpProxyConfig.port).toBe(8080);

    const httpsClient = createHttpClient({
      'https-proxy': 'https://secure-proxy.company.com',
    });

    const httpsProxyConfig = httpsClient.defaults.proxy as any;
    expect(httpsProxyConfig.port).toBe(443);
  });
});
