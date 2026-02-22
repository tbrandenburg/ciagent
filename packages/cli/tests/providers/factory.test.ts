import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createAssistantChat } from '../../src/providers/index.js';
import { CodexAssistantChat } from '../../src/providers/codex.js';
import { SchemaValidatingChat } from '../../src/providers/schema-validating-chat.js';
import { ReliableAssistantChat } from '../../src/providers/reliability.js';
import { mcpProvider } from '../../src/providers/mcp.js';
import { CIAConfig } from '../../src/shared/config/loader.js';

const testHome = '/tmp/cia-factory-tests';
const originalHome = process.env.HOME;

function mockProviderSdks(): void {
  vi.mock('@openai/codex-sdk', () => ({
    Codex: class {
      startThread() {
        return {
          id: 'codex-session-123',
          runStreamed: async () => ({
            events: (async function* () {
              yield {
                type: 'item.completed',
                item: { type: 'agent_message', text: 'test response' },
              };
              yield { type: 'turn.completed' };
            })(),
            abort: () => {},
          }),
        };
      }
    },
  }));

  vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
    ClaudeAgent: class {
      constructor() {}
      async startSession() {
        return { id: 'claude-session-123' };
      }
      async sendMessage() {
        return (async function* () {
          yield { type: 'text', text: 'test response' };
        })();
      }
    },
  }));
}

describe('Provider Factory', () => {
  beforeEach(() => {
    mockProviderSdks();

    // Set up test home directory
    process.env.HOME = testHome;
    mkdirSync(testHome, { recursive: true });

    // Create mock auth files with correct format
    mkdirSync(join(testHome, '.codex'), { recursive: true });
    writeFileSync(
      join(testHome, '.codex', 'auth.json'),
      JSON.stringify({
        tokens: {
          id_token: 'test-id-token',
          access_token: 'test-access-token',
        },
      })
    );

    mkdirSync(join(testHome, '.anthropic'), { recursive: true });
    writeFileSync(
      join(testHome, '.anthropic', 'auth.json'),
      JSON.stringify({ apiKey: 'test-key' })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env.HOME = originalHome;
    rmSync(testHome, { recursive: true, force: true });
  });

  it('should create basic Codex provider without wrappers', async () => {
    const config: CIAConfig = {
      provider: 'codex',
    };

    const assistant = await createAssistantChat('codex', config);

    expect(assistant.getType()).toBe('codex');
    expect(assistant).not.toBeInstanceOf(SchemaValidatingChat);
    expect(assistant).not.toBeInstanceOf(ReliableAssistantChat);
  });

  it('forwards top-level model to codex provider config', async () => {
    const codexCreateSpy = vi.spyOn(CodexAssistantChat, 'create').mockResolvedValue({
      getType: () => 'codex',
      sendQuery: vi.fn() as any,
    } as CodexAssistantChat);

    const config: CIAConfig = {
      provider: 'codex',
      model: 'gpt-5.3-codex',
    };

    await createAssistantChat('codex', config);

    expect(codexCreateSpy).toHaveBeenCalledWith({ model: 'gpt-5.3-codex' });
  });

  it('supports provider/model syntax and strips provider prefix', async () => {
    const codexCreateSpy = vi.spyOn(CodexAssistantChat, 'create').mockResolvedValue({
      getType: () => 'codex',
      sendQuery: vi.fn() as any,
    } as CodexAssistantChat);

    const config: CIAConfig = {
      provider: 'codex',
      model: 'codex/gpt-5.3-codex',
    };

    await createAssistantChat('codex', config);

    expect(codexCreateSpy).toHaveBeenCalledWith({ model: 'gpt-5.3-codex' });
  });

  it('does not override provider model when top-level model targets another provider', async () => {
    const codexCreateSpy = vi.spyOn(CodexAssistantChat, 'create').mockResolvedValue({
      getType: () => 'codex',
      sendQuery: vi.fn() as any,
    } as CodexAssistantChat);

    const config: CIAConfig = {
      provider: 'codex',
      model: 'openai/gpt-4o',
      providers: {
        codex: {
          model: 'gpt-5.3-codex',
        },
      },
    };

    await createAssistantChat('codex', config);

    expect(codexCreateSpy).toHaveBeenCalledWith({ model: 'gpt-5.3-codex' });
  });

  it('should wrap with SchemaValidatingChat when mode is strict with schema-inline', async () => {
    const config: CIAConfig = {
      provider: 'codex',
      mode: 'strict',
      'schema-inline':
        '{"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}',
    };

    const provider = await createAssistantChat('codex', config);

    expect(provider).toBeInstanceOf(SchemaValidatingChat);
    expect(provider.getType()).toBe('codex'); // Should pass through underlying type
  });

  it('should wrap with ReliableAssistantChat when retries configured', async () => {
    const config: CIAConfig = {
      provider: 'codex',
      retries: 3,
    };

    const provider = await createAssistantChat('codex', config);

    expect(provider).toBeInstanceOf(ReliableAssistantChat);
  });

  it('should wrap with both ReliableAssistantChat and SchemaValidatingChat when both configured', async () => {
    const config: CIAConfig = {
      provider: 'codex',
      mode: 'strict',
      'schema-inline': '{"type":"object"}',
      retries: 2,
    };

    const provider = await createAssistantChat('codex', config);

    // Should be wrapped with schema validation on top of reliability
    expect(provider).toBeInstanceOf(SchemaValidatingChat);
    expect(provider.getType()).toBe('reliable-codex'); // Type reflects the reliability wrapper beneath
  });

  it('should not wrap with schema validation if not in strict mode', async () => {
    const config: CIAConfig = {
      provider: 'codex',
      mode: 'lazy',
      'schema-inline': '{"type":"object"}',
    };

    const provider = await createAssistantChat('codex', config);

    expect(provider).not.toBeInstanceOf(SchemaValidatingChat);
    expect(provider.getType()).toBe('codex');
  });

  it('should not wrap with schema validation if no schema provided', async () => {
    const config: CIAConfig = {
      provider: 'codex',
      mode: 'strict',
    };

    const provider = await createAssistantChat('codex', config);

    expect(provider).not.toBeInstanceOf(SchemaValidatingChat);
    expect(provider.getType()).toBe('codex');
  });

  it('skips MCP initialization when structured server list is empty', async () => {
    const initializeSpy = vi.spyOn(mcpProvider, 'initialize').mockResolvedValue();

    const config: CIAConfig = {
      provider: 'codex',
      mcp: {
        servers: [],
      },
    };

    await createAssistantChat('codex', config);

    expect(initializeSpy).not.toHaveBeenCalled();
  });

  it('initializes MCP when at least one server is configured', async () => {
    const initializeSpy = vi.spyOn(mcpProvider, 'initialize').mockResolvedValue();
    const getHealthInfoSpy = vi.spyOn(mcpProvider, 'getHealthInfo').mockReturnValue({
      healthy: true,
      serverCount: 1,
      connectedServers: 1,
      toolCount: 0,
      servers: [],
    });

    const config: CIAConfig = {
      provider: 'codex',
      verbose: true,
      mcp: {
        servers: [{ type: 'local', command: 'npx', args: ['-y', '@upstash/context7-mcp'] }],
      },
    };

    await createAssistantChat('codex', config);

    expect(initializeSpy).toHaveBeenCalledTimes(1);
    expect(initializeSpy).toHaveBeenCalledWith(config);
    expect(getHealthInfoSpy).toHaveBeenCalledTimes(1);
  });
});
