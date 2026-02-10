import { CIAConfig } from '../shared/config/loader.js';
import { ExitCode } from '../utils/exit-codes.js';

export async function modelsCommand(config: CIAConfig): Promise<number> {
  const providers = [config.provider ?? 'codex'];
  const models = providers.map((provider) => `${provider}:not-configured`);

  if (config.format === 'json') {
    console.log(JSON.stringify({ models }, null, 2));
  } else {
    models.forEach((model) => console.log(model));
  }

  return ExitCode.SUCCESS;
}
