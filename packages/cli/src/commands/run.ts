import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname } from 'path';
import { CIAConfig } from '../shared/config/loader.js';
import { createAssistantChat } from '../providers/index.js';
import { CommonErrors, printError } from '../shared/errors/error-handling.js';
import { ExitCode } from '../utils/exit-codes.js';

export async function runCommand(args: string[], config: CIAConfig): Promise<number> {
  const hasPrompt = args.length > 0 && args.join(' ').trim().length > 0;
  const hasInputFile = Boolean(config['input-file']);

  if (!hasPrompt && !hasInputFile) {
    const error = CommonErrors.invalidArgument('prompt', 'a positional prompt or --input-file');
    printError(error);
    return error.code;
  }

  const prompt = resolvePrompt(args, config);
  if (!prompt) {
    const error = CommonErrors.invalidArgument('prompt', 'a non-empty prompt');
    printError(error);
    return error.code;
  }

  const provider = config.provider ?? 'codex';

  try {
    const assistant = await createAssistantChat(provider, config);
    let printedAssistantOutput = false;
    let providerError: string | null = null;
    const assistantChunks: string[] = [];

    for await (const chunk of assistant.sendQuery(prompt, process.cwd())) {
      if (chunk.type === 'assistant' && chunk.content) {
        assistantChunks.push(chunk.content);
        if (config.format !== 'json') {
          console.log(chunk.content);
        }
        printedAssistantOutput = true;
      }

      if (chunk.type === 'system' && chunk.content) {
        console.error(chunk.content);
      }

      if (chunk.type === 'error' && chunk.content) {
        providerError = chunk.content;
        break;
      }
    }

    if (providerError) {
      const error = CommonErrors.executionFailed(providerError);
      printError(error);
      return error.code;
    }

    if (!printedAssistantOutput) {
      const error = CommonErrors.executionFailed(`No response content returned by ${provider}`);
      printError(error);
      return error.code;
    }

    const responseText = assistantChunks.join('\n').trim();
    const structuredOutput = {
      success: true,
      response: parseStructuredResponse(responseText),
      metadata: {
        runner: 'cia',
        provider,
        timestamp: new Date().toISOString(),
      },
    };

    if (config.format === 'json') {
      console.log(JSON.stringify(structuredOutput, null, 2));
    }

    if (config['output-file']) {
      writeOutputFile(
        config['output-file'],
        config['output-format'],
        structuredOutput,
        responseText
      );
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAuthOrProviderError =
      message.includes('auth') ||
      message.includes('Unsupported provider') ||
      message.includes('HOME is not set');

    const cliError = isAuthOrProviderError
      ? CommonErrors.authConfig(message)
      : CommonErrors.executionFailed(message);
    printError(cliError);
    return cliError.code;
  }
}

function parseStructuredResponse(responseText: string): unknown {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function writeOutputFile(
  outputPath: string,
  outputFormat: CIAConfig['output-format'],
  structuredOutput: { success: boolean; response: unknown; metadata: Record<string, string> },
  responseText: string
): void {
  const resolvedFormat = resolveOutputFormat(outputPath, outputFormat);
  const content = serializeOutput(resolvedFormat, structuredOutput, responseText);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, 'utf8');
}

function resolveOutputFormat(
  outputPath: string,
  explicitFormat: CIAConfig['output-format']
): 'json' | 'yaml' | 'md' | 'text' {
  if (explicitFormat) {
    return explicitFormat;
  }

  const extension = extname(outputPath).toLowerCase();
  if (extension === '.json') {
    return 'json';
  }
  if (extension === '.yaml' || extension === '.yml') {
    return 'yaml';
  }
  if (extension === '.md' || extension === '.markdown') {
    return 'md';
  }
  if (extension === '.txt') {
    return 'text';
  }
  return 'json';
}

function serializeOutput(
  format: 'json' | 'yaml' | 'md' | 'text',
  structuredOutput: { success: boolean; response: unknown; metadata: Record<string, string> },
  responseText: string
): string {
  if (format === 'json') {
    return `${JSON.stringify(structuredOutput, null, 2)}\n`;
  }

  if (format === 'yaml') {
    const safeResponse =
      typeof structuredOutput.response === 'string'
        ? JSON.stringify(structuredOutput.response)
        : JSON.stringify(structuredOutput.response);

    return [
      `success: ${structuredOutput.success}`,
      `response: ${safeResponse}`,
      'metadata:',
      `  runner: ${structuredOutput.metadata.runner}`,
      `  provider: ${structuredOutput.metadata.provider}`,
      `  timestamp: ${structuredOutput.metadata.timestamp}`,
      '',
    ].join('\n');
  }

  if (format === 'md') {
    return [
      '# cia Result',
      '',
      `- success: ${structuredOutput.success}`,
      `- provider: ${structuredOutput.metadata.provider}`,
      `- timestamp: ${structuredOutput.metadata.timestamp}`,
      '',
      '## response',
      '',
      '```',
      responseText,
      '```',
      '',
    ].join('\n');
  }

  return `${responseText}\n`;
}

function resolvePrompt(args: string[], config: CIAConfig): string {
  if (args.length > 0) {
    return args.join(' ').trim();
  }

  if (config['input-file']) {
    return readFileSync(config['input-file'], 'utf8').trim();
  }

  return '';
}
