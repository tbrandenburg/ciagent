import { IAssistantChat, Message, ChatChunk } from './types.js';

type TestScenario =
  | 'success'
  | 'delay-then-success'
  | 'nonretryable-model-error'
  | 'stall'
  | 'setup-delay-success';

export class TestDoubleAssistantChat implements IAssistantChat {
  private readonly scenario: TestScenario;
  private readonly env: NodeJS.ProcessEnv;

  constructor(scenario: string, env: NodeJS.ProcessEnv = process.env) {
    this.scenario = this.normalizeScenario(scenario);
    this.env = env;
  }

  async *sendQuery(
    _input: string | Message[],
    _cwd: string,
    _resumeSessionId?: string
  ): AsyncGenerator<ChatChunk> {
    if (this.scenario === 'success' || this.scenario === 'setup-delay-success') {
      yield { type: 'assistant', content: 'ok-from-test-double' };
      return;
    }

    if (this.scenario === 'delay-then-success') {
      const delayMs = Number(this.env.CIA_E2E_DELAY_MS ?? '25');
      await new Promise(resolve => setTimeout(resolve, Math.max(0, delayMs)));
      yield { type: 'assistant', content: 'ok-from-test-double' };
      return;
    }

    if (this.scenario === 'nonretryable-model-error') {
      yield {
        type: 'error',
        content: 'The model `gpt-5.3-codex` does not exist or you do not have access to it.',
      };
      return;
    }

    await new Promise(() => undefined);
  }

  getType(): string {
    return 'test-double';
  }

  async listModels(): Promise<string[]> {
    return ['test-double-model'];
  }

  private normalizeScenario(rawScenario: string): TestScenario {
    if (
      rawScenario === 'success' ||
      rawScenario === 'delay-then-success' ||
      rawScenario === 'nonretryable-model-error' ||
      rawScenario === 'stall' ||
      rawScenario === 'setup-delay-success'
    ) {
      return rawScenario;
    }

    throw new Error(`Unsupported e2e scenario: ${rawScenario}`);
  }
}
