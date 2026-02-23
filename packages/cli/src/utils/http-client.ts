import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CIAConfig } from '../shared/config/loader';
import { retry } from '../providers/mcp/reliability';

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
    // Axios handles proxy configuration automatically from environment
    proxy: networkConfig?.['http-proxy']
      ? {
          host: new URL(networkConfig['http-proxy']).hostname,
          port: parseInt(new URL(networkConfig['http-proxy']).port) || 8080,
          protocol: new URL(networkConfig['http-proxy']).protocol.slice(0, -1),
        }
      : false,
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
