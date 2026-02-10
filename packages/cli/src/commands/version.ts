import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Print version information with system details
 */
export async function printVersionInfo(): Promise<void> {
  try {
    // Read package.json to get version
    const packageJsonPath = resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    console.log(`ciagent v${packageJson.version}`);
    console.log(`Bun v${Bun.version}`);
    console.log(`Platform: ${process.platform}-${process.arch}`);
    console.log(`Node.js compatibility: v${process.version}`);

    // Show additional system info in debug mode
    if (process.env.DEBUG) {
      console.log(`Process ID: ${process.pid}`);
      console.log(`Working Directory: ${process.cwd()}`);
      console.log(`Home Directory: ${process.env.HOME || process.env.USERPROFILE || 'unknown'}`);
    }
  } catch (error) {
    // Fallback version info
    console.log('ciagent v0.1.0');
    console.log(`Bun v${Bun.version}`);
    console.log(`Platform: ${process.platform}-${process.arch}`);

    if (process.env.DEBUG) {
      console.error('Error reading version details:', error);
    }
  }
}
