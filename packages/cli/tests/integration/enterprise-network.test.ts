import { afterEach, describe, expect, it, vi } from 'vitest';

import { main } from '../../src/cli.js';
import { loadConfig } from '../../src/shared/config/loader.js';
import { ExitCode } from '../../src/utils/exit-codes.js';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';

const NETWORK_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_ENV_PROXY',
] as const;

function withEnv(
  overrides: Partial<Record<(typeof NETWORK_ENV_KEYS)[number], string | undefined>>
) {
  const previous = Object.fromEntries(
    NETWORK_ENV_KEYS.map(key => [key, process.env[key]])
  ) as Record<(typeof NETWORK_ENV_KEYS)[number], string | undefined>;

  for (const key of NETWORK_ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  return () => {
    for (const key of NETWORK_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

describe.skipIf(!runIntegrationTests)('enterprise-network-integration', () => {
  const restoreEnv = withEnv({});

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('loads enterprise proxy and CA settings from environment variables', () => {
    const restore = withEnv({
      HTTP_PROXY: 'http://proxy.internal:8080',
      HTTPS_PROXY: 'https://secure-proxy.internal:8443',
      NO_PROXY: 'localhost,127.0.0.1,.internal',
      NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/corporate.pem',
      NODE_USE_ENV_PROXY: '1',
    });

    const config = loadConfig({ provider: 'codex', model: 'gpt-4.1' });

    expect(config.network).toEqual({
      'http-proxy': 'http://proxy.internal:8080',
      'https-proxy': 'https://secure-proxy.internal:8443',
      'no-proxy': ['localhost', '127.0.0.1', '.internal'],
      'ca-bundle-path': '/etc/ssl/certs/corporate.pem',
      'use-env-proxy': true,
    });

    restore();
  });

  it('fails loudly when proxy URL env vars are malformed', async () => {
    const restore = withEnv({
      HTTP_PROXY: 'corp-proxy-without-scheme',
      HTTPS_PROXY: undefined,
      NO_PROXY: undefined,
      NODE_EXTRA_CA_CERTS: undefined,
      NODE_USE_ENV_PROXY: undefined,
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main(['run', 'health-check']);

    expect(exitCode).toBe(ExitCode.INPUT_VALIDATION);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration error'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid network.http-proxy'));

    restore();
  });

  it('fails loudly when CA bundle env var is multi-line', async () => {
    const restore = withEnv({
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      NO_PROXY: undefined,
      NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/one.pem\n/etc/ssl/certs/two.pem',
      NODE_USE_ENV_PROXY: undefined,
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitCode = await main(['run', 'health-check']);

    expect(exitCode).toBe(ExitCode.INPUT_VALIDATION);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration error'));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid network.ca-bundle-path')
    );

    restore();
  });
});
