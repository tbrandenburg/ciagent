import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Get runtime version information
 */
function getRuntimeVersion(): string {
  // Check if running in Bun environment
  if (typeof Bun !== 'undefined' && Bun.version) {
    return `Bun v${Bun.version}`;
  }
  // Fallback to Node.js version
  return `Node.js ${process.version}`;
}

/**
 * Print version information with system details
 */
export async function printVersionInfo(): Promise<void> {
  try {
    // Read package.json to get version
    const packageJsonPath = resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    console.log(`ciagent v${packageJson.version}`);
    console.log(getRuntimeVersion());
    console.log(`Platform: ${process.platform}-${process.arch}`);

    // Show additional system info in debug mode
    if (process.env.DEBUG) {
      console.log(`Process ID: ${process.pid}`);
      console.log(`Working Directory: ${process.cwd()}`);
      console.log(`Home Directory: ${process.env.HOME || process.env.USERPROFILE || 'unknown'}`);
    }
  } catch (error) {
    // Fallback version info
    console.log('ciagent v0.1.0');
    console.log(getRuntimeVersion());
    console.log(`Platform: ${process.platform}-${process.arch}`);

    if (process.env.DEBUG) {
      console.error('Error reading version details:', error);
    }
  }
}
