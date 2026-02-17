import { CIAConfig } from '../shared/config/loader.js';
import { mcpProvider } from '../providers/mcp.js';
import { CommonErrors, printError } from '../shared/errors/error-handling.js';
import { ExitCode } from '../utils/exit-codes.js';

export async function mcpCommand(args: string[], config: CIAConfig): Promise<number> {
  const subcommand = args[0];

  if (!subcommand) {
    printMCPUsage();
    return ExitCode.SUCCESS;
  }

  try {
    // Initialize MCP provider if not already done
    await mcpProvider.initialize(config);

    switch (subcommand.toLowerCase()) {
      case 'status':
        return await statusCommand();
      case 'connect':
        return await connectCommand(args.slice(1));
      case 'disconnect':
        return await disconnectCommand(args.slice(1));
      case 'auth':
        return await authCommand(args.slice(1));
      case 'tools':
        return await toolsCommand();
      default: {
        const error = CommonErrors.unknownCommand(`mcp ${subcommand}`);
        printError(error);
        return error.code;
      }
    }
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      'MCP command',
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function statusCommand(): Promise<number> {
  try {
    const healthInfo = mcpProvider.getHealthInfo();

    if (healthInfo.serverCount === 0) {
      console.log('No MCP servers configured');
      return ExitCode.SUCCESS;
    }

    console.log('MCP Server Status:');
    console.log('==================');
    console.log(`Total servers: ${healthInfo.serverCount}`);
    console.log(`Connected: ${healthInfo.connectedServers}`);
    console.log(`Available tools: ${healthInfo.toolCount}`);
    console.log('');

    for (const server of healthInfo.servers) {
      console.log(`${server.name}: ${formatStatus(server.status.status)}`);
      if (server.status.status === 'failed' && 'error' in server.status) {
        console.log(`  Error: ${server.status.error}`);
      }
      if (server.status.status === 'connected' && 'toolCount' in server.status) {
        console.log(`  Tools: ${server.status.toolCount}`);
      }
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      'status check',
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function connectCommand(args: string[]): Promise<number> {
  const serverName = args[0];

  if (!serverName) {
    const error = CommonErrors.invalidArgument('server name', 'a valid MCP server name');
    printError(error);
    return error.code;
  }

  try {
    console.log(`Connecting to MCP server: ${serverName}...`);
    // For now, this is handled during initialization
    // In the future, we could add runtime connection management
    console.log(
      `Note: MCP servers are connected during initialization. Use 'cia mcp status' to check connection status.`
    );
    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      `connect to ${serverName}`,
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function disconnectCommand(args: string[]): Promise<number> {
  const serverName = args[0];

  if (!serverName) {
    const error = CommonErrors.invalidArgument('server name', 'a valid MCP server name');
    printError(error);
    return error.code;
  }

  try {
    console.log(`Disconnecting from MCP server: ${serverName}...`);
    // For now, this is handled during cleanup
    // In the future, we could add runtime disconnection management
    console.log(
      `Note: MCP servers are managed during application lifecycle. Server will disconnect on application exit.`
    );
    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      `disconnect from ${serverName}`,
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function authCommand(args: string[]): Promise<number> {
  const serverName = args[0];

  if (!serverName) {
    const error = CommonErrors.invalidArgument('server name', 'a valid MCP server name');
    printError(error);
    return error.code;
  }

  try {
    console.log(`OAuth authentication for: ${serverName}...`);
    console.log(`Note: OAuth authentication is handled automatically during server connection.`);
    console.log(
      `If authentication failed, check your configuration and server status with 'cia mcp status'.`
    );
    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      `authenticate with ${serverName}`,
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

async function toolsCommand(): Promise<number> {
  try {
    const allTools = mcpProvider.getTools();

    if (allTools.length === 0) {
      console.log('No tools available from MCP servers');
      console.log('Check server status with: cia mcp status');
      return ExitCode.SUCCESS;
    }

    console.log('Available MCP Tools:');
    console.log('====================');
    console.log(`Total tools: ${allTools.length}`);
    console.log('');

    const toolsByServer = new Map<string, any[]>();

    for (const tool of allTools) {
      const serverName = tool.serverName;
      if (!toolsByServer.has(serverName)) {
        toolsByServer.set(serverName, []);
      }
      toolsByServer.get(serverName)!.push(tool);
    }

    for (const [serverName, tools] of toolsByServer.entries()) {
      console.log(`${serverName} (${tools.length} tools):`);
      for (const tool of tools) {
        console.log(`  - ${tool.name}${tool.description ? `: ${tool.description}` : ''}`);
        console.log(`    ID: ${tool.id}`);
      }
      console.log('');
    }

    return ExitCode.SUCCESS;
  } catch (error) {
    const cliError = CommonErrors.operationFailed(
      'list tools',
      error instanceof Error ? error.message : String(error)
    );
    printError(cliError);
    return cliError.code;
  }
}

function formatStatus(status: string): string {
  const statusEmojis: Record<string, string> = {
    connected: '🟢 Connected',
    connecting: '🟡 Connecting...',
    disconnected: '🔴 Disconnected',
    failed: '❌ Failed',
    needs_auth: '🔐 Authentication Required',
    needs_client_registration: '📝 Registration Required',
    disabled: '⚪ Disabled',
  };

  return statusEmojis[status] || `❓ ${status}`;
}

function printMCPUsage(): void {
  console.log('Usage: cia mcp <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  status                    Show server connection status');
  console.log('  connect <name>           Connect to MCP server');
  console.log('  disconnect <name>        Disconnect from server');
  console.log('  auth <name>              Start OAuth authentication flow');
  console.log('  tools                    List available tools from all servers');
  console.log('');
  console.log('Examples:');
  console.log('  cia mcp status');
  console.log('  cia mcp connect github');
  console.log('  cia mcp auth claude-server');
  console.log('  cia mcp tools');
}
