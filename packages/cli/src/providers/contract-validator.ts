import { ChatChunk } from './types.js';
import { createError } from '../shared/errors/error-handling.js';
import { ExitCode } from '../utils/exit-codes.js';

const ALLOWED_CHUNK_TYPES = new Set<ChatChunk['type']>([
  'assistant',
  'result',
  'system',
  'tool',
  'thinking',
  'error',
]);

export function validateChunkTypes(chunk: ChatChunk): boolean {
  return ALLOWED_CHUNK_TYPES.has(chunk.type);
}

export function validateSessionId(chunk: ChatChunk): boolean {
  if (chunk.type === 'result') {
    return (
      chunk.sessionId !== undefined && chunk.sessionId !== null && chunk.sessionId.trim() !== ''
    );
  }
  return true; // Other chunk types don't require sessionId
}

export function createValidationError(message: string, details?: string) {
  return createError(
    ExitCode.LLM_EXECUTION,
    `Contract validation failed: ${message}`,
    details,
    'This indicates a provider implementation issue - report to maintainers'
  );
}
