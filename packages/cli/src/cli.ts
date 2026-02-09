#!/usr/bin/env bun

import { parseArgs } from 'util';
import { ExitCode } from './utils/exit-codes.js';
import { loadConfig } from './config/loader.js';
import { validateConfig, validateExecutionRequirements } from './utils/validation.js';
import { CommonErrors, printError, handleUnexpectedError } from './utils/error-handling.js';

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  let parsedArgs: any;
  
  try {
    parsedArgs = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        // CLI SPEC REQUIRED OPTIONS:
        mode: { type: 'string', default: 'lazy' }, // lazy|strict
        format: { type: 'string', default: 'default' }, // default|json
        provider: { type: 'string', short: 'p', default: 'azure' },
        model: { type: 'string', short: 'm' },
        context: { type: 'string', multiple: true },
        'input-file': { type: 'string' },
        'schema-file': { type: 'string' },
        'schema-inline': { type: 'string' },
        'output-file': { type: 'string', default: 'result.json' },
        'output-format': { type: 'string' }, // json|yaml|md|text
        retries: { type: 'string', default: '1' },
        'retry-backoff': { type: 'boolean', default: true },
        timeout: { type: 'string', default: '60' },
        endpoint: { type: 'string' },
        'api-key': { type: 'string' },
        'api-version': { type: 'string' },
        org: { type: 'string' },
        'log-level': { type: 'string', default: 'INFO' },
      },
      allowPositionals: true,
      strict: false,
    });
  } catch (error) {
    const cliError = CommonErrors.invalidArgument(
      'command line arguments',
      'valid options and format'
    );
    printError(cliError);
    await printUsage();
    return cliError.code;
  }
  
  const { values, positionals } = parsedArgs;
  
  // Handle help and version first
  if (values.help) {
    await printHelp();
    return ExitCode.SUCCESS;
  }
  
  if (values.version) {
    await printVersion();
    return ExitCode.SUCCESS;
  }
  
  // Load configuration with CLI args taking precedence
  const cliConfig = {
    mode: values.mode as 'lazy' | 'strict',
    format: values.format as 'default' | 'json',
    provider: values.provider,
    model: values.model,
    context: values.context,
    'input-file': values['input-file'],
    'schema-file': values['schema-file'],
    'schema-inline': values['schema-inline'],
    'output-file': values['output-file'],
    'output-format': values['output-format'] as 'json' | 'yaml' | 'md' | 'text',
    retries: values.retries ? parseInt(values.retries, 10) : undefined,
    'retry-backoff': values['retry-backoff'],
    timeout: values.timeout ? parseInt(values.timeout, 10) : undefined,
    endpoint: values.endpoint,
    'api-key': values['api-key'],
    'api-version': values['api-version'],
    org: values.org,
    'log-level': values['log-level'],
  };
  
  const config = loadConfig(cliConfig);
  
  // Validate configuration
  const configValidation = validateConfig(config);
  if (!configValidation.isValid) {
    const error = CommonErrors.invalidConfig(
      'configuration validation',
      configValidation.errors.join(', ')
    );
    printError(error);
    return error.code;
  }
  
  // Handle commands
  const command = positionals[0];
  
  if (!command) {
    const error = CommonErrors.missingCommand();
    printError(error);
    return error.code;
  }
  
  switch (command.toLowerCase()) {
    case 'run':
      return await handleRunCommand(positionals.slice(1), config);
      
    default:
      const error = CommonErrors.unknownCommand(command);
      printError(error);
      return error.code;
  }
}

/**
 * Handle the 'run' command - main AI execution
 */
async function handleRunCommand(_args: string[], config: any): Promise<number> {
  // Validate execution requirements
  const execValidation = validateExecutionRequirements(config);
  if (!execValidation.isValid) {
    const error = CommonErrors.invalidConfig(
      'execution requirements',
      execValidation.errors.join(', ')
    );
    printError(error);
    return error.code;
  }
  
  // For Phase 1, fail gracefully with "No provider configured"
  // This will be implemented in later phases
  const error = CommonErrors.missingProvider();
  printError(error);
  return error.code;
}

/**
 * Print help information
 */
async function printHelp(): Promise<void> {
  const { printHelpText } = await import('./commands/help');
  printHelpText();
}

/**
 * Print version information
 */
async function printVersion(): Promise<void> {
  const { printVersionInfo } = await import('./commands/version');
  await printVersionInfo();
}

/**
 * Print basic usage (fallback when help command isn't available)
 */
async function printUsage(): Promise<void> {
  console.log('Usage: cia <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  run <prompt>    Execute AI prompt');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help      Show help information');
  console.log('  -v, --version   Show version information');
  console.log('  -p, --provider  AI provider (azure, openai, anthropic, google, local)');
  console.log('  -m, --model     Model name');
  console.log('  --mode          Execution mode (lazy, strict)');
  console.log('  --format        Output format (default, json)');
  console.log('');
  console.log('For complete documentation, use: cia --help');
}

// Only run main if this file is executed directly
if (import.meta.main) {
  main().then((exitCode) => {
    process.exit(exitCode);
  }).catch((error) => {
    const cliError = handleUnexpectedError(error);
    printError(cliError);
    process.exit(cliError.code);
  });
}