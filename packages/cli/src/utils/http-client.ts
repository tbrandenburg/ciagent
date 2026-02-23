import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CIAConfig } from '../shared/config/loader';
import { retry } from '../providers/mcp/reliability';

type NetworkConfig = CIAConfig['network'];

// Helper function to check if URL should bypass proxy
function shouldBypassProxy(hostname: string, noProxyList?: string[]): boolean {
  if (!noProxyList || noProxyList.length === 0) {
    return false;
  }

  const host = hostname.toLowerCase();

  return noProxyList.some(pattern => {
    const p = pattern.toLowerCase().trim();

    // Exact match
    if (p === host) {
      return true;
    }

    // Wildcard pattern (*.example.com)
    if (p.startsWith('*.')) {
      const domain = p.slice(2);
      return host === domain || host.endsWith('.' + domain);
    }

    // Domain suffix (.example.com)
    if (p.startsWith('.')) {
      return host.endsWith(p);
    }

    return false;
  });
}

export interface HttpClientConfig {
  timeout?: number;
  retries?: number;
  baseURL?: string;
}

export function createHttpClient(
  networkConfig?: CIAConfig['network'],
  clientConfig?: HttpClientConfig
): AxiosInstance {
  const proxyConfig = createProxyConfig(networkConfig);

  const axiosConfig: AxiosRequestConfig = {
    timeout: clientConfig?.timeout || 30000,
    // Complete proxy configuration with no-proxy support
    proxy: proxyConfig,
  };

  if (clientConfig?.baseURL) {
    axiosConfig.baseURL = clientConfig.baseURL;
  }

  const client = axios.create(axiosConfig);

  // Add no-proxy bypass interceptor
  if (networkConfig?.['no-proxy'] && proxyConfig) {
    client.interceptors.request.use(config => {
      if (config.url) {
        const url = new URL(config.url, config.baseURL);
        if (shouldBypassProxy(url.hostname, networkConfig['no-proxy'])) {
          config.proxy = false;
        }
      }
      return config;
    });
  }

  // Request interceptor for logging
  client.interceptors.request.use(config => {
    // Add any common headers or logging
    return config;
  });

  // Response interceptor for retry logic
  client.interceptors.response.use(
    response => response,
    async error => {
      if (clientConfig?.retries && error.response?.status >= 500) {
        return retry(() => client.request(error.config), {
          attempts: clientConfig.retries,
        });
      }
      throw error;
    }
  );

  return client;
}

// Add helper function for proxy configuration
function createProxyConfig(networkConfig?: NetworkConfig) {
  if (!networkConfig) {
    return false;
  }

  const httpProxy = networkConfig['http-proxy'];
  const httpsProxy = networkConfig['https-proxy'];

  // If no proxies configured, return false
  if (!httpProxy && !httpsProxy) {
    return false;
  }

  // Axios uses a single proxy config, prefer HTTPS proxy for secure connections
  const proxyUrl = httpsProxy || httpProxy;
  if (!proxyUrl) {
    return false;
  }

  return parseProxyUrl(proxyUrl);
}

function parseProxyUrl(proxyUrl: string) {
  const url = new URL(proxyUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 8080),
    protocol: url.protocol.slice(0, -1),
    auth:
      url.username && url.password
        ? {
            username: url.username,
            password: url.password,
          }
        : undefined,
  };
}
