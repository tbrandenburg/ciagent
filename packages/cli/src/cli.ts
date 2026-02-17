#!/usr/bin/env bun

import { parseArgs } from 'util';
import { ExitCode } from './utils/exit-codes.js';
import { loadConfig, type CIAConfig } from './shared/config/loader.js';
import { validateConfig } from './shared/validation/validation.js';
import { CommonErrors, printError, handleUnexpectedError } from './shared/errors/error-handling.js';
import { runCommand } from './commands/run.js';
import { modelsCommand } from './commands/models.js';
import { mcpCommand } from './commands/mcp.js';

function parseCliArgs(args: string[]) {
  return parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      mode: { type: 'string' },
      format: { type: 'string' },
      provider: { type: 'string', short: 'p' },
      model: { type: 'string', short: 'm' },
      context: { type: 'string', multiple: true },
      'input-file': { type: 'string' },
      'schema-file': { type: 'string' },
      'schema-inline': { type: 'string' },
      'template-file': { type: 'string' },
      'template-vars': { type: 'string' },
      'template-vars-file': { type: 'string' },
      'output-file': { type: 'string' },
      'output-format': { type: 'string' },
      retries: { type: 'string' },
      'retry-backoff': { type: 'boolean' },
      timeout: { type: 'string' },
      endpoint: { type: 'string' },
      'api-key': { type: 'string' },
      'api-version': { type: 'string' },
      org: { type: 'string' },
      'log-level': { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
}

function toCliConfig(values: Record<string, unknown>): Partial<CIAConfig> {
  return {
    mode: values.mode as 'lazy' | 'strict',
    format: values.format as 'default' | 'json',
    provider: values.provider as string | undefined,
    model: values.model as string | undefined,
    context: values.context as string[] | undefined,
    'input-file': values['input-file'] as string | undefined,
    'schema-file': values['schema-file'] as string | undefined,
    'schema-inline': values['schema-inline'] as string | undefined,
    'template-file': values['template-file'] as string | undefined,
    'template-vars': values['template-vars'] as string | undefined,
    'template-vars-file': values['template-vars-file'] as string | undefined,
    'output-file': values['output-file'] as string | undefined,
    'output-format': values['output-format'] as 'json' | 'yaml' | 'md' | 'text' | undefined,
    retries: values.retries ? Number.parseInt(String(values.retries), 10) : undefined,
    'retry-backoff': values['retry-backoff'] as boolean | undefined,
    timeout: values.timeout ? Number.parseInt(String(values.timeout), 10) : undefined,
    endpoint: values.endpoint as string | undefined,
    'api-key': values['api-key'] as string | undefined,
    'api-version': values['api-version'] as string | undefined,
    org: values.org as string | undefined,
    'log-level': values['log-level'] as string | undefined,
  };
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  let parsedArgs: ReturnType<typeof parseCliArgs>;

  try {
    parsedArgs = parseCliArgs(args);
  } catch {
    const cliError = CommonErrors.invalidArgument(
      'command line arguments',
      'valid options and format'
    );
    printError(cliError);
    await printUsage();
    return cliError.code;
  }

  const { values, positionals } = parsedArgs;

  if (values.help) {
    await printHelp();
    return ExitCode.SUCCESS;
  }

  if (values.version) {
    await printVersion();
    return ExitCode.SUCCESS;
  }

  const config = withDefaults(loadConfig(toCliConfig(values as Record<string, unknown>)));

  const configValidation = validateConfig(config);
  if (!configValidation.isValid) {
    const error = CommonErrors.invalidConfig(
      'configuration validation',
      configValidation.errors.join(', ')
    );
    printError(error);
    return error.code;
  }

  const command = positionals[0];
  if (!command) {
    const error = CommonErrors.missingCommand();
    printError(error);
    return error.code;
  }

  switch (command.toLowerCase()) {
    case 'run':
      return await runCommand(positionals.slice(1), config);
    case 'models':
      return await modelsCommand(config);
    case 'mcp':
      return await mcpCommand(positionals.slice(1), config);
    default: {
      const error = CommonErrors.unknownCommand(command);
      printError(error);
      return error.code;
    }
  }
}

function withDefaults(config: CIAConfig): CIAConfig {
  return {
    mode: config.mode ?? 'lazy',
    format: config.format ?? 'default',
    provider: config.provider ?? 'codex',
    'output-file': config['output-file'] ?? 'result.json',
    retries: config.retries ?? 1,
    'retry-backoff': config['retry-backoff'] ?? true,
    timeout: config.timeout ?? 60,
    'log-level': config['log-level'] ?? 'INFO',
    ...config,
  };
}

async function printHelp(): Promise<void> {
  const { printHelpText } = await import('./commands/help');
  printHelpText();
}

async function printVersion(): Promise<void> {
  const { printVersionInfo } = await import('./commands/version');
  await printVersionInfo();
}

async function printUsage(): Promise<void> {
  console.log('Usage: cia <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  run <prompt>    Execute AI prompt');
  console.log('  models          List available models (phase-1 scaffold)');
  console.log('  mcp             MCP server management');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help      Show help information');
  console.log('  -v, --version   Show version information');
  console.log('  -p, --provider  AI provider (codex)');
  console.log('  -m, --model     Model name');
  console.log('  --mode          Execution mode (lazy, strict)');
  console.log('  --format        Output format (default, json)');
  console.log('');
  console.log('For complete documentation, use: cia --help');
}

function runCli(): void {
  main()
    .then(exitCode => {
      process.exit(exitCode);
    })
    .catch(error => {
      const cliError = handleUnexpectedError(error);
      printError(cliError);
      process.exit(cliError.code);
    });
}

if (import.meta.main) {
  runCli();
}
