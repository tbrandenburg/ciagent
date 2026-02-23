import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VercelProviderFactory } from '../../src/providers/vercel-factory';

// Mock the http-client module
vi.mock('../../src/utils/http-client', () => ({
  createHttpClient: vi.fn(() => ({
    request: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  })),
}));

describe('Vercel Factory with axios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create Azure provider with network configuration', async () => {
    const networkConfig = {
      'http-proxy': 'http://proxy.example.com:8080',
      timeout: 45000,
      retries: 5,
    };

    // Test that the factory can create providers with network config
    const provider = await VercelProviderFactory.createProvider(
      'azure',
      {
        model: 'gpt-4o',
        apiKey: 'test-key',
        resourceName: 'test-resource',
      },
      networkConfig
    );

    expect(provider).toBeDefined();
  });

  it('should create OpenAI provider with default LLMv7 configuration', async () => {
    const provider = await VercelProviderFactory.createProvider('openai');
    expect(provider).toBeDefined();
  });

  it('should handle network configuration without proxy', async () => {
    const networkConfig = {
      'ca-bundle-path': '/path/to/ca-bundle.pem',
      timeout: 60000,
    };

    const provider = await VercelProviderFactory.createProvider(
      'azure',
      {
        model: 'gpt-4o',
      },
      networkConfig
    );

    expect(provider).toBeDefined();
    expect(process.env.NODE_EXTRA_CA_CERTS).toBe('/path/to/ca-bundle.pem');
  });
});
