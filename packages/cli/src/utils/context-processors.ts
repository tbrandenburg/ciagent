/**
 * Context processing utilities with smart parameter resolution
 *
 * Provides functions for:
 * - Smart auto-detection of input types (URLs, files, folders, direct content)
 * - File context processing with format detection
 * - Folder context processing with .gitignore filtering
 * - GitHub URL context processing
 * - Direct content handling (JSON/text)
 * - Extensible processor interface
 */

import {
  loadFileWithFormatDetection,
  getFolderListing,
  pathExists,
  getPathStats,
} from './file-utils.js';

import {
  fetchGitHubMetadata,
  parseGitHubUrl,
  validateGitHubUrl,
  GitHubPRMetadata,
  GitHubIssueMetadata,
} from './github-api.js';

/**
 * Context input types that can be auto-detected
 */
export type ContextInputType = 'file' | 'folder' | 'url' | 'direct' | 'unknown';

/**
 * Resolved context input with detected type
 */
export interface ResolvedContextInput {
  type: ContextInputType;
  value: string;
  metadata?: {
    isGitHubUrl?: boolean;
    fileExtension?: string;
    isDirectory?: boolean;
    seemsLikeJson?: boolean;
  };
}

/**
 * Processed context result
 */
export interface ProcessedContext {
  source: string;
  type: ContextInputType;
  content: string;
  metadata: {
    size?: number;
    format?: string;
    files_count?: number;
    github_type?: 'pull' | 'issue';
    processed_at: string;
  };
  success: boolean;
  error?: string;
}

/**
 * Context processor interface for extensibility
 */
export interface ContextProcessor {
  canProcess(input: ResolvedContextInput): boolean;
  process(input: ResolvedContextInput): Promise<ProcessedContext>;
  priority: number; // Higher priority processors are tried first
}

/**
 * Smart resolution of context input to detect type automatically
 * Eliminates need for explicit type specification
 * @param contextParam Input parameter (URL, file path, folder path, or direct content)
 * @returns Resolved input with detected type and metadata
 */
export function resolveContextInput(contextParam: string): ResolvedContextInput {
  const trimmed = contextParam.trim();

  // URL detection
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const isGitHubUrl = validateGitHubUrl(trimmed);
    return {
      type: 'url',
      value: trimmed,
      metadata: {
        isGitHubUrl,
      },
    };
  }

  // Direct JSON content detection
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return {
        type: 'direct',
        value: trimmed,
        metadata: {
          seemsLikeJson: true,
        },
      };
    } catch {
      // If JSON parsing fails, might still be a file path
      // Continue to file system checks
    }
  }

  // File system detection
  try {
    if (pathExists(trimmed)) {
      const stats = getPathStats(trimmed);
      if (stats) {
        const isDirectory = stats.type === 'directory';
        return {
          type: isDirectory ? 'folder' : 'file',
          value: trimmed,
          metadata: {
            isDirectory,
            fileExtension: isDirectory ? undefined : getFileExtensionFromPath(trimmed),
          },
        };
      }
    }
  } catch {
    // File system access failed, continue to other checks
  }

  // If no other type matches, treat as direct content
  return {
    type: 'direct',
    value: trimmed,
    metadata: {
      seemsLikeJson: false,
    },
  };
}

/**
 * Simple file extension extraction
 */
function getFileExtensionFromPath(filePath: string): string | undefined {
  const lastDot = filePath.lastIndexOf('.');
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));

  if (lastDot > lastSlash && lastDot !== -1) {
    return filePath.substring(lastDot);
  }

  return undefined;
}

/**
 * Process file context with format detection
 * @param filePath Path to the file
 * @returns Processed context result
 */
export async function processFileContext(filePath: string): Promise<ProcessedContext> {
  try {
    const fileContent = loadFileWithFormatDetection(filePath);

    // Format content for context
    let contextContent = '';
    if (typeof fileContent.content === 'string') {
      contextContent = fileContent.content;
    } else {
      // Convert object to formatted JSON
      contextContent = JSON.stringify(fileContent.content, null, 2);
    }

    return {
      source: filePath,
      type: 'file',
      content: `[Context from file: ${filePath}]\n${contextContent}`,
      metadata: {
        size: fileContent.size,
        format: fileContent.format,
        processed_at: new Date().toISOString(),
      },
      success: true,
    };
  } catch (error) {
    return {
      source: filePath,
      type: 'file',
      content: '',
      metadata: {
        processed_at: new Date().toISOString(),
      },
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process folder context with .gitignore filtering
 * @param folderPath Path to the folder
 * @returns Processed context result
 */
export async function processFolderContext(folderPath: string): Promise<ProcessedContext> {
  try {
    const folderListing = getFolderListing(folderPath);

    // Create a summary of the folder structure
    const files = folderListing.files.filter(f => f.type === 'file');
    const dirs = folderListing.files.filter(f => f.type === 'directory');

    let contextContent = `[Context from folder: ${folderPath}]\n`;
    contextContent += `Total files: ${files.length}, Total directories: ${dirs.length}\n`;
    contextContent += `Total size: ${Math.round(folderListing.totalSize / 1024)}KB\n\n`;

    // List files with their extensions
    if (files.length > 0) {
      contextContent += 'Files:\n';
      files.slice(0, 50).forEach(file => {
        // Limit to 50 files to avoid overwhelming
        const relativePath = file.path.replace(folderListing.path, '').substring(1);
        const sizeKB = Math.round(file.size / 1024);
        contextContent += `  ${relativePath} (${sizeKB}KB)\n`;
      });

      if (files.length > 50) {
        contextContent += `  ... and ${files.length - 50} more files\n`;
      }
    }

    // List directories
    if (dirs.length > 0) {
      contextContent += '\nDirectories:\n';
      dirs.slice(0, 20).forEach(dir => {
        // Limit to 20 dirs
        const relativePath = dir.path.replace(folderListing.path, '').substring(1);
        contextContent += `  ${relativePath}/\n`;
      });

      if (dirs.length > 20) {
        contextContent += `  ... and ${dirs.length - 20} more directories\n`;
      }
    }

    return {
      source: folderPath,
      type: 'folder',
      content: contextContent,
      metadata: {
        files_count: folderListing.totalFiles,
        size: folderListing.totalSize,
        processed_at: new Date().toISOString(),
      },
      success: true,
    };
  } catch (error) {
    return {
      source: folderPath,
      type: 'folder',
      content: '',
      metadata: {
        processed_at: new Date().toISOString(),
      },
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process GitHub URL context
 * @param url GitHub URL (PR or issue)
 * @returns Processed context result
 */
export async function processUrlContext(url: string): Promise<ProcessedContext> {
  try {
    // Check if it's a GitHub URL
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      // Not a GitHub URL - for now just return a placeholder
      return {
        source: url,
        type: 'url',
        content: `[Context from URL: ${url}]\n(Non-GitHub URL processing not yet implemented)`,
        metadata: {
          processed_at: new Date().toISOString(),
        },
        success: true,
      };
    }

    // Fetch GitHub metadata
    const metadata = await fetchGitHubMetadata(url);

    let contextContent = '';
    if ('head_ref' in metadata) {
      // It's a PR
      const pr = metadata as GitHubPRMetadata;
      contextContent = `[Context from GitHub PR: ${url}]\n`;
      contextContent += `Title: ${pr.title}\n`;
      contextContent += `Author: ${pr.author}\n`;
      contextContent += `State: ${pr.state}\n`;
      contextContent += `Head: ${pr.head_ref} → Base: ${pr.base_ref}\n`;
      contextContent += `Created: ${pr.created_at}\n`;
      contextContent += `Updated: ${pr.updated_at}\n\n`;
      contextContent += `Description:\n${pr.body || '(No description)'}`;
    } else {
      // It's an Issue
      const issue = metadata as GitHubIssueMetadata;
      contextContent = `[Context from GitHub Issue: ${url}]\n`;
      contextContent += `Title: ${issue.title}\n`;
      contextContent += `Author: ${issue.author}\n`;
      contextContent += `State: ${issue.state}\n`;
      contextContent += `Labels: ${issue.labels.join(', ') || '(None)'}\n`;
      contextContent += `Created: ${issue.created_at}\n`;
      contextContent += `Updated: ${issue.updated_at}\n\n`;
      contextContent += `Description:\n${issue.body || '(No description)'}`;
    }

    return {
      source: url,
      type: 'url',
      content: contextContent,
      metadata: {
        github_type: parsed.type,
        processed_at: new Date().toISOString(),
      },
      success: true,
    };
  } catch (error) {
    return {
      source: url,
      type: 'url',
      content: '',
      metadata: {
        processed_at: new Date().toISOString(),
      },
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Process direct content (JSON or text)
 * @param content Direct content string
 * @returns Processed context result
 */
export async function processDirectContent(content: string): Promise<ProcessedContext> {
  try {
    const trimmed = content.trim();

    // Try to parse as JSON first
    let contextContent = '';
    let format = 'text';

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        contextContent = `[Context from direct JSON content]\n${JSON.stringify(parsed, null, 2)}`;
        format = 'json';
      } catch {
        // Not valid JSON, treat as text
        contextContent = `[Context from direct text content]\n${trimmed}`;
      }
    } else {
      contextContent = `[Context from direct text content]\n${trimmed}`;
    }

    return {
      source: '(direct content)',
      type: 'direct',
      content: contextContent,
      metadata: {
        format,
        size: content.length,
        processed_at: new Date().toISOString(),
      },
      success: true,
    };
  } catch (error) {
    return {
      source: '(direct content)',
      type: 'direct',
      content: '',
      metadata: {
        processed_at: new Date().toISOString(),
      },
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Default context processors in priority order
 */
const DEFAULT_PROCESSORS: ContextProcessor[] = [
  {
    canProcess: input => input.type === 'url',
    process: input => processUrlContext(input.value),
    priority: 100,
  },
  {
    canProcess: input => input.type === 'file',
    process: input => processFileContext(input.value),
    priority: 90,
  },
  {
    canProcess: input => input.type === 'folder',
    process: input => processFolderContext(input.value),
    priority: 80,
  },
  {
    canProcess: input => input.type === 'direct',
    process: input => processDirectContent(input.value),
    priority: 70,
  },
];

/**
 * Process context input with smart resolution and appropriate processor
 * This is the main entry point that combines resolution and processing
 * @param contextParam Input parameter
 * @param customProcessors Optional custom processors to use
 * @returns Processed context result
 */
export async function processContext(
  contextParam: string,
  customProcessors?: ContextProcessor[]
): Promise<ProcessedContext> {
  // Step 1: Resolve input type
  const resolved = resolveContextInput(contextParam);

  // Step 2: Find appropriate processor
  const processors = customProcessors || DEFAULT_PROCESSORS;
  const sortedProcessors = processors.sort((a, b) => b.priority - a.priority);

  for (const processor of sortedProcessors) {
    if (processor.canProcess(resolved)) {
      try {
        return await processor.process(resolved);
      } catch (error) {
        // Continue to next processor if current one fails
        console.error(
          `Processor failed for ${contextParam}: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
    }
  }

  // Fallback: treat as direct content if no processor can handle it
  return processDirectContent(contextParam);
}

/**
 * Process multiple context sources
 * Mirrors the existing integrateContextSources pattern but with enhanced processing
 * @param contextSources Array of context source parameters
 * @returns Combined context string
 */
export async function processMultipleContextSources(contextSources: string[]): Promise<string> {
  const contextParts: string[] = [];

  for (const source of contextSources) {
    try {
      const result = await processContext(source);

      if (result.success && result.content.trim()) {
        contextParts.push(result.content);
      } else if (!result.success && result.error) {
        // Log warning but continue processing other context sources
        console.error(`Warning: Could not process context source "${source}": ${result.error}`);
      }
    } catch (error) {
      // Log warning but continue processing other context sources
      console.error(
        `Warning: Could not process context source "${source}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return contextParts.join('\n\n');
}
