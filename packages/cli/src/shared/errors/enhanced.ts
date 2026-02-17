/**
 * Enhanced error types for agent capabilities
 * Extends the existing error hierarchy pattern
 */

/**
 * Base error class for session-related operations
 */
export class SessionError extends Error {
  constructor(
    message: string,
    public readonly sessionId?: string,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

/**
 * Error thrown when session is not found
 */
export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, sessionId, 'retrieve');
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error thrown when session creation fails
 */
export class SessionCreationError extends SessionError {
  constructor(reason: string) {
    super(`Session creation failed: ${reason}`, undefined, 'create');
    this.name = 'SessionCreationError';
  }
}

/**
 * Error thrown when session update fails
 */
export class SessionUpdateError extends SessionError {
  constructor(sessionId: string, reason: string) {
    super(`Session update failed: ${reason}`, sessionId, 'update');
    this.name = 'SessionUpdateError';
  }
}

/**
 * Base error class for tool registry operations
 */
export class ToolRegistryError extends Error {
  constructor(
    message: string,
    public readonly toolName?: string,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'ToolRegistryError';
  }
}

/**
 * Error thrown when tool registration fails
 */
export class ToolRegistrationError extends ToolRegistryError {
  constructor(toolName: string, reason: string) {
    super(`Tool registration failed: ${reason}`, toolName, 'register');
    this.name = 'ToolRegistrationError';
  }
}

/**
 * Error thrown when tool validation fails
 */
export class ToolValidationError extends ToolRegistryError {
  constructor(toolName: string, validationErrors: string[]) {
    const errorsText = validationErrors.join('; ');
    super(`Tool validation failed: ${errorsText}`, toolName, 'validate');
    this.name = 'ToolValidationError';
  }
}

/**
 * Error thrown when tool is not found in registry
 */
export class ToolNotFoundError extends ToolRegistryError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, toolName, 'retrieve');
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Base error class for configuration migration operations
 */
export class ConfigMigrationError extends Error {
  constructor(
    message: string,
    public readonly configPath?: string,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'ConfigMigrationError';
  }
}

/**
 * Error thrown when config schema validation fails during migration
 */
export class ConfigSchemaError extends ConfigMigrationError {
  constructor(configPath: string, schemaErrors: string[]) {
    const errorsText = schemaErrors.join('; ');
    super(`Configuration schema validation failed: ${errorsText}`, configPath, 'validate');
    this.name = 'ConfigSchemaError';
  }
}

/**
 * Error thrown when config backup fails during migration
 */
export class ConfigBackupError extends ConfigMigrationError {
  constructor(configPath: string, reason: string) {
    super(`Configuration backup failed: ${reason}`, configPath, 'backup');
    this.name = 'ConfigBackupError';
  }
}

/**
 * Error thrown when config file format is incompatible
 */
export class ConfigFormatError extends ConfigMigrationError {
  constructor(configPath: string, expectedFormat: string, actualFormat: string) {
    super(
      `Invalid configuration format: expected ${expectedFormat}, got ${actualFormat}`,
      configPath,
      'parse'
    );
    this.name = 'ConfigFormatError';
  }
}
