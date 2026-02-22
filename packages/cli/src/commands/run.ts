import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname } from 'path';
import { CIAConfig, loadStructuredConfig } from '../shared/config/loader.js';
import { createAssistantChat } from '../providers/index.js';
import { CommonErrors, printError } from '../shared/errors/error-handling.js';
import { ExitCode } from '../utils/exit-codes.js';
import { processTemplate } from '../utils/template.js';
import { processMultipleContextSources } from '../utils/context-processors.js';
import { SkillsManager } from '../skills/index.js';
import { mcpProvider } from '../providers/mcp.js';

const MAX_ASSISTANT_OUTPUT_BYTES = 1024 * 1024;

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

  const prompt = await resolvePrompt(args, config);
  if (!prompt) {
    const error = CommonErrors.invalidArgument('prompt', 'a non-empty prompt');
    printError(error);
    return error.code;
  }

  // Check for capability discovery queries and enhance prompt with comprehensive inventory
  const enhancedPrompt = await enhanceCapabilityQuery(prompt, config);

  const provider = config.provider ?? 'codex';

  const timeoutSeconds = config.timeout ?? 60;
  const timeoutMs = timeoutSeconds * 1000; // Convert to milliseconds
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const assistant = await createAssistantChat(provider, config);
    let printedAssistantOutput = false;
    let providerError: string | null = null;
    const assistantChunks: string[] = [];
    let assistantOutputBytes = 0;

    if (config.verbose === true) {
      // Fire-and-forget status output so it never blocks prompt execution
      void emitStatusMessages(config).catch(error => {
        console.log(
          '[Status] Warning: Status emission failed:',
          error instanceof Error ? error.message : String(error)
        );
      });
    }

    const abortController = new AbortController();
    timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    // Check if operation was aborted before starting
    if (abortController.signal.aborted) {
      throw new Error(`Operation timed out after ${timeoutSeconds} seconds`);
    }

    const chunkIterator = assistant
      .sendQuery(enhancedPrompt, process.cwd())
      [Symbol.asyncIterator]();
    const hardDeadline = Date.now() + timeoutMs;

    while (true) {
      const remainingMs = hardDeadline - Date.now();
      if (remainingMs <= 0 || abortController.signal.aborted) {
        throw new Error(`Operation timed out after ${timeoutSeconds} seconds`);
      }

      const nextChunk = await withTimeout(
        chunkIterator.next(),
        remainingMs,
        `Operation timed out after ${timeoutSeconds} seconds`
      );

      if (nextChunk.done) {
        break;
      }

      const chunk = nextChunk.value;

      if (chunk.type === 'assistant' && chunk.content) {
        assistantOutputBytes += Buffer.byteLength(chunk.content, 'utf8');
        if (assistantOutputBytes > MAX_ASSISTANT_OUTPUT_BYTES) {
          throw new Error(
            `Assistant output exceeded maximum size of ${MAX_ASSISTANT_OUTPUT_BYTES} bytes`
          );
        }

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
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
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
    // Clear timeout in case of error
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout;

  return Promise.race([
    promise.then(result => {
      clearTimeout(timeout);
      return result;
    }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(message));
      }, ms);
    }),
  ]);
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

async function resolvePrompt(args: string[], config: CIAConfig): Promise<string> {
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

  // Load and apply skill if specified
  if (config.skill) {
    try {
      const skillsManager = new SkillsManager();
      await skillsManager.initialize(config.skills || {});

      const skill = skillsManager.getSkill(config.skill);
      if (!skill) {
        console.error(
          `Warning: Skill '${config.skill}' not found. Available skills: ${skillsManager
            .listSkills()
            .map(s => s.name)
            .join(', ')}`
        );
      } else {
        // Prepend skill content to the base prompt
        const skillContent = skill.content || '';
        if (skillContent.trim()) {
          basePrompt = skillContent.trim() + (basePrompt ? `\n\n${basePrompt}` : '');
        }
      }
    } catch (error) {
      console.error(
        `Warning: Failed to load skill '${config.skill}': ${error instanceof Error ? error.message : String(error)}`
      );
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
    const contextContent = await processMultipleContextSources(config.context);
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

/**
/**
 * Detects capability queries and enhances them with comprehensive tool/skill inventory
 */
async function enhanceCapabilityQuery(prompt: string, config: CIAConfig): Promise<string> {
  // Capability query patterns - case insensitive
  const capabilityPatterns = [
    /what.*tools.*do.*you.*have/i,
    /what.*skills.*do.*you.*have/i,
    /what.*can.*you.*do/i,
    /what.*are.*your.*capabilities/i,
    /list.*your.*tools/i,
    /list.*your.*skills/i,
    /show.*me.*your.*capabilities/i,
    /what.*tools.*and.*skills/i,
    /what.*functionality.*available/i,
    /inventory.*of.*tools/i,
    /what.*commands.*available/i,
  ];

  // Check if this looks like a capability query
  const isCapabilityQuery = capabilityPatterns.some(pattern => pattern.test(prompt));

  if (!isCapabilityQuery) {
    return prompt;
  }

  // Build comprehensive capability inventory
  const capabilityInventory: string[] = [
    '## CIA CLI Capability Inventory\n',
    'Here is a comprehensive overview of all available tools and skills:\n',
  ];

  try {
    const mcpServerCount = getMcpServerCount(config);

    if (mcpServerCount > 0) {
      // Get MCP tools and server status
      await mcpProvider.initialize(config);
      const mcpHealthInfo = mcpProvider.getHealthInfo();

      capabilityInventory.push('### MCP (Model Context Protocol) Tools\n');
      capabilityInventory.push(
        `**Status**: ${mcpHealthInfo.serverCount} servers configured, ${mcpHealthInfo.connectedServers} connected\n`
      );

      const mcpTools = mcpProvider.getTools();
      if (mcpTools.length > 0) {
        capabilityInventory.push(`**Available Tools** (${mcpTools.length} total):\n`);

        // Group tools by server
        const toolsByServer: Record<string, typeof mcpTools> = {};
        mcpTools.forEach(tool => {
          if (!toolsByServer[tool.serverName]) {
            toolsByServer[tool.serverName] = [];
          }
          toolsByServer[tool.serverName].push(tool);
        });

        Object.entries(toolsByServer).forEach(([serverName, tools]) => {
          capabilityInventory.push(`- **${serverName}** (${tools.length} tools):`);
          tools.forEach(tool => {
            capabilityInventory.push(`  - \`${tool.name}\`: ${tool.description}`);
          });
          capabilityInventory.push('');
        });
      } else {
        capabilityInventory.push('- No MCP tools currently available\n');
      }
    } else {
      capabilityInventory.push('### MCP (Model Context Protocol) Tools\n');
      capabilityInventory.push('- **Status**: No MCP servers configured\n');
      capabilityInventory.push(
        '- Use `cia mcp add <server> <url-or-command>` to add MCP servers\n'
      );
    }

    // Get Skills information
    if (config.skills || config.skill) {
      const skillsManager = new SkillsManager();
      await skillsManager.initialize(config.skills || {});
      const availableSkills = skillsManager.listSkills();

      capabilityInventory.push('### Skills System\n');
      if (availableSkills.length > 0) {
        capabilityInventory.push(`**Available Skills** (${availableSkills.length} total):\n`);
        availableSkills.forEach(skill => {
          capabilityInventory.push(`- \`${skill.name}\`: ${skill.description}`);
        });
        capabilityInventory.push('');

        if (config.skill) {
          const activeSkill = skillsManager.getSkill(config.skill);
          if (activeSkill) {
            capabilityInventory.push(`**Currently Using**: ${config.skill}\n`);
          } else {
            capabilityInventory.push(`**Note**: Requested skill '${config.skill}' not found\n`);
          }
        }
      } else {
        capabilityInventory.push('- No skills found in configured paths\n');
        capabilityInventory.push('- Use `cia skills install <source>` to add skills\n');
      }
    } else {
      capabilityInventory.push('### Skills System\n');
      capabilityInventory.push('- Skills not configured\n');
      capabilityInventory.push('- Use `cia skills list` to discover available skills\n');
    }
  } catch (error) {
    capabilityInventory.push(
      '\n**Note**: Some capabilities may not be available due to initialization errors\n'
    );
  }

  const inventoryText = capabilityInventory.join('\n');
  return `${inventoryText}\n\n---\n\n**User Query**: ${prompt}\n\nBased on the capability inventory above, please provide a comprehensive answer about the tools and skills available through this CIA CLI instance.`;
}

/**
 * Emit status messages for available MCP tools and Skills capabilities
 */
async function emitStatusMessages(config: CIAConfig): Promise<void> {
  const capabilities: string[] = [];
  const mcpServerCount = getMcpServerCount(config);

  // Check MCP status
  if (mcpServerCount > 0) {
    try {
      await mcpProvider.initialize(config);
      const mcpStatusChunk = mcpProvider.getStatusChunk();

      if (mcpStatusChunk.type === 'mcp_aggregate_status') {
        const { serverCount, connectedServers, toolCount } = mcpStatusChunk;

        if (toolCount > 0) {
          capabilities.push(`${toolCount} MCP tools from ${connectedServers} servers`);
          console.log(
            `[Status] MCP: ${connectedServers}/${serverCount} servers connected, ${toolCount} tools available`
          );
        } else if (serverCount > 0) {
          console.log(`[Status] MCP: ${serverCount} servers configured, but no tools available`);
        } else {
          console.log('[Status] MCP: No servers configured');
        }
      }
    } catch (error) {
      console.log(
        '[Status] MCP initialization failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  } else {
    console.log('[Status] MCP: No servers configured');
  }

  // Check Skills status
  if (config.skills || config.skill) {
    try {
      const skillsManager = new SkillsManager();
      await skillsManager.initialize(config.skills || {});
      const availableSkills = skillsManager.listSkills();

      if (availableSkills.length > 0) {
        capabilities.push(`${availableSkills.length} skills available`);

        if (config.skill) {
          const activeSkill = skillsManager.getSkill(config.skill);
          if (activeSkill) {
            console.log(
              `[Status] Skills: Using '${config.skill}' skill, ${availableSkills.length} total available`
            );
          } else {
            console.log(
              `[Status] Skills: '${config.skill}' not found, ${availableSkills.length} available: ${availableSkills.map(s => s.name).join(', ')}`
            );
          }
        } else {
          console.log(
            `[Status] Skills: ${availableSkills.length} available: ${availableSkills.map(s => s.name).join(', ')}`
          );
        }
      } else {
        console.log('[Status] Skills: No skills found in configured paths');
      }
    } catch (error) {
      console.log(
        '[Status] Skills initialization failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Show overall status
  if (capabilities.length > 0) {
    console.log(`[Status] Available capabilities: ${capabilities.join(', ')}`);
  } else {
    console.log('[Status] No enhanced capabilities available - using basic AI provider only');
  }
}

function getMcpServerCount(config: CIAConfig): number {
  const structuredConfig = loadStructuredConfig(config);
  if (!structuredConfig.mcp || !('servers' in structuredConfig.mcp)) {
    return 0;
  }
  return Array.isArray(structuredConfig.mcp.servers) ? structuredConfig.mcp.servers.length : 0;
}
