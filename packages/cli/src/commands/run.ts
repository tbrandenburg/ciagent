import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname } from 'path';
import { CIAConfig } from '../shared/config/loader.js';
import { createAssistantChat } from '../providers/index.js';
import { CommonErrors, printError } from '../shared/errors/error-handling.js';
import { ExitCode } from '../utils/exit-codes.js';
import { processTemplate } from '../utils/template.js';

export async function runCommand(args: string[], config: CIAConfig): Promise<number> {
  const hasPrompt = args.length > 0 && args.join(' ').trim().length > 0;
  const hasInputFile = Boolean(config['input-file']);
  const hasTemplateFile = Boolean(config['template-file']);
  const hasStdin = (process as any).stdin.isTTY === false;

  if (!hasPrompt && !hasInputFile && !hasTemplateFile && !hasStdin) {
    const error = CommonErrors.invalidArgument(
      'prompt',
      'a positional prompt, --input-file, --template-file, or stdin pipe'
    );
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

  // Set up AbortController for timeout handling
  const abortController = new (globalThis as any).AbortController();
  const timeoutSeconds = config.timeout ?? 60;
  const timeoutMs = timeoutSeconds * 1000; // Convert to milliseconds

  const timeoutId = (globalThis as any).setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const assistant = await createAssistantChat(provider, config);
    let printedAssistantOutput = false;
    let providerError: string | null = null;
    const assistantChunks: string[] = [];

    // Check if operation was aborted before starting
    if (abortController.signal.aborted) {
      throw new Error(`Operation timed out after ${timeoutSeconds} seconds`);
    }

    for await (const chunk of assistant.sendQuery(prompt, process.cwd())) {
      // Check for abort signal during iteration
      if (abortController.signal.aborted) {
        throw new Error(`Operation timed out after ${timeoutSeconds} seconds`);
      }

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

    // Clear timeout if operation completed successfully
    (globalThis as any).clearTimeout(timeoutId);

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
    // Clear timeout in case of error
    (globalThis as any).clearTimeout(timeoutId);

    const message = error instanceof Error ? error.message : String(error);

    // Check for timeout errors specifically
    if (message.includes('timed out') || message.includes('timeout')) {
      const timeoutError = CommonErrors.timeout(timeoutSeconds);
      printError(timeoutError);
      return timeoutError.code;
    }

    // Check for schema validation errors
    if (message.includes('Schema validation failed') || message.includes('schema validation')) {
      const schemaError = CommonErrors.schemaValidationFailed(message);
      printError(schemaError);
      return schemaError.code;
    }

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
  let basePrompt = '';

  // First, get the base prompt from various sources
  if (args.length > 0) {
    basePrompt = args.join(' ').trim();
  } else if (config['template-file']) {
    // Template file can serve as the primary prompt source
    try {
      basePrompt = readFileSync(config['template-file'], 'utf8').trim();
    } catch (error) {
      // Template file reading errors should be handled by validation
      basePrompt = '';
    }
  } else if (config['input-file']) {
    basePrompt = processInputFile(config['input-file']);
  } else if ((process as any).stdin.isTTY === false) {
    // Read from stdin if no args or file provided and stdin has data
    try {
      basePrompt = readFileSync('/dev/stdin', 'utf8').trim();
    } catch (error) {
      // If stdin reading fails, return empty to trigger validation error
      basePrompt = '';
    }
  }

  // Process template variables if provided
  if (config['template-vars'] || config['template-vars-file']) {
    try {
      let variables: Record<string, string> = {};

      // Load variables from file if provided
      if (config['template-vars-file']) {
        const varsContent = readFileSync(config['template-vars-file'], 'utf8');
        variables = { ...variables, ...JSON.parse(varsContent) };
      }

      // Load variables from inline JSON if provided
      if (config['template-vars']) {
        variables = { ...variables, ...JSON.parse(config['template-vars']) };
      }

      basePrompt = processTemplate(basePrompt, variables);
    } catch (error) {
      // Template processing errors should be handled by validation
      // If we reach here, just use the original prompt
      console.error(
        `Warning: Template processing failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Integrate context sources if available
  if (config.context && config.context.length > 0) {
    const contextContent = integrateContextSources(config.context);
    if (contextContent.trim()) {
      basePrompt = `${contextContent}\n\n${basePrompt}`;
    }
  }

  return basePrompt.trim();
}

/**
 * Processes input from file, handling both plain text and JSON formats
 */
function processInputFile(inputFile: string): string {
  const content = readFileSync(inputFile, 'utf8').trim();

  // Try to parse as JSON first
  try {
    const jsonData = JSON.parse(content);

    // If it's an object with a "prompt" field, extract it
    if (typeof jsonData === 'object' && jsonData !== null && 'prompt' in jsonData) {
      return String(jsonData.prompt || '').trim();
    }

    // If it's just a JSON string, return it as-is
    return content;
  } catch {
    // Not valid JSON, treat as plain text
    return content;
  }
}

/**
 * Integrates context from multiple sources (files, URLs)
 */
function integrateContextSources(contextSources: string[]): string {
  const contextParts: string[] = [];

  for (const source of contextSources) {
    try {
      let contextContent = '';

      if (source.startsWith('http://') || source.startsWith('https://')) {
        // URL context - for now just note it (actual fetching could be implemented later)
        contextContent = `[Context from URL: ${source}]\n(URL content fetching not yet implemented)`;
      } else {
        // File context
        contextContent = readFileSync(source, 'utf8').trim();
        if (contextContent) {
          contextContent = `[Context from ${source}]\n${contextContent}`;
        }
      }

      if (contextContent.trim()) {
        contextParts.push(contextContent);
      }
    } catch (error) {
      // Log warning but continue processing other context sources
      console.error(
        `Warning: Could not read context source "${source}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return contextParts.join('\n\n');
}
