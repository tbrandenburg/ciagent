import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CIAConfig } from '../shared/config/loader';
import { retry } from '../providers/mcp/reliability';

type NetworkConfig = CIAConfig['network'];

export interface HttpClientConfig {
  timeout?: number;
  retries?: number;
  baseURL?: string;
}

export function createHttpClient(
  networkConfig?: CIAConfig['network'],
  clientConfig?: HttpClientConfig
): AxiosInstance {
  const axiosConfig: AxiosRequestConfig = {
    timeout: clientConfig?.timeout || 30000,
    // Complete proxy configuration with no-proxy support
    proxy: createProxyConfig(networkConfig),
  };

  const client = axios.create(axiosConfig);

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
