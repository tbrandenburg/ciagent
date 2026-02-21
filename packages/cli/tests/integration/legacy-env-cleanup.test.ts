import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../src/shared/config/loader.js';
import { validateExecutionRequirements } from '../../src/shared/validation/validation.js';

const ENV_KEYS = [
  'CIA_PROVIDER',
  'CIA_MODEL',
  'AZURE_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_ENV_PROXY',
] as const;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;

  for (const key of ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  return () => {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

describe('legacy-env-cleanup-integration', () => {
  const restoreEnv = withEnv({});

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('fails loudly when only legacy CIA_* env vars are provided', async () => {
    const restore = withEnv({
      CIA_PROVIDER: 'codex',
      CIA_MODEL: 'gpt-4',
      OPENAI_API_KEY: 'legacy-key',
    });

    const config = loadConfig();
    const validation = validateExecutionRequirements(config);

    expect(config.provider).toBeUndefined();
    expect(config.model).toBeUndefined();
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Provider is required');
    expect(validation.errors).toContain(
      'Model is required for execution. Use --model or define model in .cia/config.json.'
    );

    restore();
  });

  it('keeps enterprise network env behavior while ignoring legacy defaults', () => {
    const restore = withEnv({
      CIA_PROVIDER: 'openai',
      CIA_MODEL: 'legacy-model',
      HTTP_PROXY: 'http://corp-proxy.internal:8080',
    });

    const config = loadConfig({
      provider: 'codex',
      model: 'gpt-4',
    });

    expect(config.provider).toBe('codex');
    expect(config.model).toBe('gpt-4');
    expect(config.network?.['http-proxy']).toBe('http://corp-proxy.internal:8080');

    restore();
  });
});
