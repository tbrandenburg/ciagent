/**
 * File system utilities with format-agnostic loading and security validation
 *
 * Provides functions for:
 * - File metadata extraction
 * - Multi-format file loading (YAML → JSON → text fallback)
 * - Secure folder traversal with .gitignore support
 * - Path validation with security checks
 */

import YAML from 'yaml';
import ignore from 'ignore';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, join, extname, relative } from 'path';
import { tmpdir } from 'os';

/**
 * File metadata interface
 */
export interface FileMetadata {
  path: string;
  size: number;
  modified: Date;
  type: 'file' | 'directory';
  extension?: string;
  isReadable: boolean;
}

/**
 * File content with detected format
 */
export interface FileContent {
  path: string;
  content: string | object;
  format: 'yaml' | 'json' | 'text';
  originalFormat: 'yaml' | 'json' | 'text';
  size: number;
}

/**
 * Folder listing with metadata
 */
export interface FolderListing {
  path: string;
  files: FileMetadata[];
  totalFiles: number;
  totalSize: number;
}

/**
 * Get metadata for a file or directory
 * @param filePath Path to the file or directory
 * @returns File metadata
 */
export function getFileMetadata(filePath: string): FileMetadata {
  try {
    const resolvedPath = resolve(filePath);
    const stats = statSync(resolvedPath);

    return {
      path: resolvedPath,
      size: stats.size,
      modified: stats.mtime,
      type: stats.isDirectory() ? 'directory' : 'file',
      extension: stats.isFile() ? extname(resolvedPath).toLowerCase() : undefined,
      isReadable: true, // Will throw if not accessible
    };
  } catch (error) {
    throw new Error(
      `Cannot access file "${filePath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load file with automatic format detection and fallback parsing
 * Attempts YAML → JSON → text in sequence
 * @param filePath Path to the file
 * @returns File content with detected format
 */
export function loadFileWithFormatDetection(filePath: string): FileContent {
  const resolvedPath = resolve(filePath);

  if (!isValidPath(resolvedPath)) {
    throw new Error(`Invalid file path: path traversal detected in "${filePath}"`);
  }

  try {
    const metadata = getFileMetadata(resolvedPath);
    if (metadata.type !== 'file') {
      throw new Error(`Path "${filePath}" is not a file`);
    }

    const content = readFileSync(resolvedPath, 'utf-8');
    const extension = metadata.extension || '';

    // Try format-specific parsing first based on extension
    if (['.yml', '.yaml'].includes(extension)) {
      return attemptYamlParsing(resolvedPath, content, metadata.size);
    } else if (['.json'].includes(extension)) {
      return attemptJsonParsing(resolvedPath, content, metadata.size);
    }

    // Try smart detection for extensionless files or unknown extensions
    return attemptSmartParsing(resolvedPath, content, metadata.size);
  } catch (error) {
    throw new Error(
      `Cannot load file "${filePath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Attempt YAML parsing with JSON fallback
 */
function attemptYamlParsing(path: string, content: string, size: number): FileContent {
  try {
    const parsed = YAML.parse(content);
    return {
      path,
      content: parsed,
      format: 'yaml',
      originalFormat: 'yaml',
      size,
    };
  } catch (yamlError) {
    // Fall back to JSON
    try {
      const parsed = JSON.parse(content);
      return {
        path,
        content: parsed,
        format: 'json',
        originalFormat: 'yaml',
        size,
      };
    } catch (jsonError) {
      // Fall back to text
      return {
        path,
        content: content,
        format: 'text',
        originalFormat: 'yaml',
        size,
      };
    }
  }
}

/**
 * Attempt JSON parsing with text fallback
 */
function attemptJsonParsing(path: string, content: string, size: number): FileContent {
  try {
    const parsed = JSON.parse(content);
    return {
      path,
      content: parsed,
      format: 'json',
      originalFormat: 'json',
      size,
    };
  } catch (jsonError) {
    // Fall back to text
    return {
      path,
      content: content,
      format: 'text',
      originalFormat: 'json',
      size,
    };
  }
}

/**
 * Attempt smart parsing: YAML → JSON → text
 */
function attemptSmartParsing(path: string, content: string, size: number): FileContent {
  // Try YAML first (more permissive, can parse JSON too)
  try {
    const parsed = YAML.parse(content);
    if (parsed !== null && typeof parsed === 'object') {
      return {
        path,
        content: parsed,
        format: 'yaml',
        originalFormat: 'text',
        size,
      };
    }
  } catch {
    // Continue to JSON
  }

  // Try JSON
  try {
    const parsed = JSON.parse(content);
    return {
      path,
      content: parsed,
      format: 'json',
      originalFormat: 'text',
      size,
    };
  } catch {
    // Continue to text
  }

  // Default to text
  return {
    path,
    content: content,
    format: 'text',
    originalFormat: 'text',
    size,
  };
}

/**
 * Get folder listing with .gitignore filtering
 * @param folderPath Path to the folder
 * @returns Folder listing with file metadata
 */
export function getFolderListing(folderPath: string): FolderListing {
  const resolvedPath = resolve(folderPath);

  if (!isValidPath(resolvedPath)) {
    throw new Error(`Invalid folder path: path traversal detected in "${folderPath}"`);
  }

  try {
    const metadata = getFileMetadata(resolvedPath);
    if (metadata.type !== 'directory') {
      throw new Error(`Path "${folderPath}" is not a directory`);
    }

    const entries = readdirSync(resolvedPath);
    const files: FileMetadata[] = [];
    let totalSize = 0;

    // Load .gitignore if it exists
    const ig = loadGitignorePatterns(resolvedPath);

    for (const entry of entries) {
      const entryPath = join(resolvedPath, entry);
      const relativePath = relative(resolvedPath, entryPath);

      // Check if this is a directory to properly handle .gitignore patterns
      let isDirectory = false;
      try {
        const stat = statSync(entryPath);
        isDirectory = stat.isDirectory();
      } catch {
        // Skip inaccessible entries
        continue;
      }

      // Skip if matches .gitignore patterns
      if (shouldIgnoreFile(relativePath, ig, isDirectory)) {
        continue;
      }

      try {
        const entryMetadata = getFileMetadata(entryPath);
        files.push(entryMetadata);
        if (entryMetadata.type === 'file') {
          totalSize += entryMetadata.size;
        }
      } catch (error) {
        // Skip inaccessible files but log warning
        console.error(
          `Warning: Cannot access "${entryPath}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      path: resolvedPath,
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      totalFiles: files.length,
      totalSize,
    };
  } catch (error) {
    throw new Error(
      `Cannot list folder "${folderPath}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load .gitignore patterns from a directory
 */
function loadGitignorePatterns(folderPath: string): ReturnType<typeof ignore> | null {
  try {
    const gitignorePath = join(folderPath, '.gitignore');
    const content = readFileSync(gitignorePath, 'utf-8');
    return ignore().add(content);
  } catch {
    return null;
  }
}

function shouldIgnoreFile(
  relativePath: string,
  ig: ReturnType<typeof ignore> | null,
  isDirectory: boolean = false
): boolean {
  if (!ig) {
    return false;
  }

  // For directories, check both with and without trailing slash
  if (isDirectory) {
    return ig.ignores(relativePath) || ig.ignores(relativePath + '/');
  }

  return ig.ignores(relativePath);
}

/**
 * Validate file/folder path for security (prevent path traversal attacks)
 * @param path Path to validate
 * @returns True if path is safe
 */
export function isValidPath(path: string): boolean {
  if (!path || path.trim() === '') {
    return false;
  }

  try {
    // Use Node.js path resolution for proper validation
    const resolved = resolve(path);
    const rel = relative(process.cwd(), resolved);

    // Allow paths within current working directory
    if (!rel.startsWith('..')) {
      return !isDangerousSystemPath(resolved);
    }

    // Allow access to system temp directory for legitimate use cases (like tests)
    const tmpDir = tmpdir();
    const relToTmp = relative(tmpDir, resolved);
    if (!relToTmp.startsWith('..')) {
      return !isDangerousSystemPath(resolved);
    }

    // Reject all other path traversal attempts
    return false;
  } catch {
    return false; // Invalid path format
  }
}

function isDangerousSystemPath(resolved: string): boolean {
  const normalized = resolved.toLowerCase();
  const dangerousPaths = ['/etc/', '/proc/', '/sys/', '/boot/'];
  if (process.platform === 'win32') {
    dangerousPaths.push('\\windows\\', '\\system32\\');
  }

  return dangerousPaths.some(dangerous => normalized.includes(dangerous));
}

/**
 * Check if a path exists and is accessible
 * @param path Path to check
 * @returns True if path exists and is accessible
 */
export function pathExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

/**
 * Get safe path statistics without throwing errors
 * @param path Path to check
 * @returns Basic path info or null if inaccessible
 */
export function getPathStats(path: string): { type: 'file' | 'directory'; size: number } | null {
  try {
    if (!isValidPath(path) || !pathExists(path)) {
      return null;
    }

    const stats = statSync(path);
    return {
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
    };
  } catch {
    return null;
  }
}
