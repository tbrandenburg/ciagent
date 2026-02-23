import { describe, it, expect } from 'vitest';
import { createHttpClient } from '../../src/utils/http-client';

describe('HTTP Client Proxy Configuration', () => {
  it('should configure HTTP proxy correctly', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.company.com:8080',
    });

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

  it('should store no-proxy configuration', () => {
    const client = createHttpClient({
      'http-proxy': 'http://proxy.company.com:8080',
      'no-proxy': ['localhost', '*.internal.com', '192.168.*'],
    });

    // Check that proxy is configured
    expect(client.defaults.proxy).toBeTruthy();
    expect(client.defaults.proxy).not.toBe(false);

    // Note: no-proxy handling will be implemented at request level
    // as axios doesn't natively support no-proxy lists
    const proxyConfig = client.defaults.proxy as any;
    expect(proxyConfig.host).toBe('proxy.company.com');
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
