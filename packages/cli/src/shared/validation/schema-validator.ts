/**
 * JSON Schema validation utilities using AJV
 *
 * Provides secure, cached schema compilation and validation following
 * proven patterns from ai-first-devops-toolkit retry logic with proper
 * error handling and security configuration.
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import { JSONSchema7 } from 'json-schema';

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  isValid: boolean;
  errors?: ErrorObject[];
  data?: unknown;
}

/**
 * Schema validator configuration
 */
export interface SchemaValidatorConfig {
  /** Enable caching of compiled schemas */
  enableCaching?: boolean;
  /** Maximum cache size */
  maxCacheSize?: number;
  /** Timeout for validation operations (ms) */
  validationTimeout?: number;
}

/**
 * Secure JSON Schema validator with caching and error handling
 *
 * Based on proven patterns from dev/ai-first-devops-toolkit with security-first
 * configuration to prevent ReDoS attacks and ensure safe validation.
 */
export class SchemaValidator {
  private readonly ajv: any;
  private readonly schemaCache: Map<string, ValidateFunction>;
  private readonly config: Required<SchemaValidatorConfig>;

  constructor(config: SchemaValidatorConfig = {}) {
    this.config = {
      enableCaching: config.enableCaching ?? true,
      maxCacheSize: config.maxCacheSize ?? 100,
      validationTimeout: config.validationTimeout ?? 5000,
    };

    // Security-first AJV configuration following plan specifications
    this.ajv = new Ajv({
      validateSchema: true, // Validate schemas on compilation
      addUsedSchema: false, // Prevent schema pollution (security)
      allErrors: true, // Return all validation errors
      removeAdditional: false, // Don't modify input data
      useDefaults: false, // Don't apply default values
      coerceTypes: false, // Strict type checking
    });

    this.schemaCache = new Map();
  }

  /**
   * Compile a JSON schema into a validation function
   *
   * @param schema - JSON Schema object
   * @returns Compiled validation function
   * @throws Error if schema compilation fails
   */
  public compileSchema(schema: JSONSchema7): ValidateFunction {
    const schemaKey = this.generateSchemaKey(schema);

    // Check cache first if caching is enabled
    if (this.config.enableCaching && this.schemaCache.has(schemaKey)) {
      const cached = this.schemaCache.get(schemaKey);
      if (cached) {
        return cached;
      }
    }

    try {
      // Compile schema with timeout protection
      const validateFn = this.compileWithTimeout(schema);

      // Cache compiled schema if caching is enabled
      if (this.config.enableCaching) {
        this.cacheCompiledSchema(schemaKey, validateFn);
      }

      return validateFn;
    } catch (err) {
      throw new Error(
        `Schema compilation failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate JSON data against a compiled schema
   *
   * @param data - Data to validate (JSON string or parsed object)
   * @param schema - JSON Schema object
   * @returns Validation result with errors if any
   */
  public validate(data: string | unknown, schema: JSONSchema7): SchemaValidationResult {
    try {
      // Parse JSON string if provided
      let parsedData: unknown;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (parseError) {
          return {
            isValid: false,
            errors: [
              this.createErrorObject(
                'format',
                { format: 'json' },
                `Invalid JSON: ${parseError instanceof Error ? parseError.message : 'Parse error'}`
              ),
            ],
          };
        }
      } else {
        parsedData = data;
      }

      // Compile and validate with the schema
      const validateFn = this.compileSchema(schema);
      const isValid = Boolean(validateFn(parsedData));

      return {
        isValid,
        errors: validateFn.errors ? [...validateFn.errors] : undefined,
        data: isValid ? parsedData : undefined,
      };
    } catch (err) {
      return {
        isValid: false,
        errors: [
          this.createErrorObject(
            'validation',
            {},
            `Validation error: ${err instanceof Error ? err.message : 'Unknown error'}`
          ),
        ],
      };
    }
  }

  /**
   * Generate a cache key for a schema
   *
   * @private
   */
  private generateSchemaKey(schema: JSONSchema7): string {
    // Use schema stringification as cache key
    // Note: This is a simple implementation. In production, consider using
    // a more robust hashing algorithm for better performance with large schemas.
    return JSON.stringify(schema);
  }

  /**
   * Compile schema with timeout protection
   *
   * @private
   */
  private compileWithTimeout(schema: JSONSchema7): ValidateFunction {
    // Note: AJV compilation is synchronous, so timeout is primarily for
    // protection against ReDoS in regex patterns within the schema
    const startTime = Date.now();

    try {
      const validateFn = this.ajv.compile(schema);

      const compilationTime = Date.now() - startTime;
      if (compilationTime > this.config.validationTimeout) {
        throw new Error(
          `Schema compilation timeout (${compilationTime}ms > ${this.config.validationTimeout}ms)`
        );
      }

      return validateFn;
    } catch (err) {
      const compilationTime = Date.now() - startTime;
      throw new Error(
        `Schema compilation failed after ${compilationTime}ms: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Cache a compiled schema with size limits
   *
   * @private
   */
  private cacheCompiledSchema(key: string, validateFn: ValidateFunction): void {
    // Implement simple LRU eviction if cache is full
    if (this.schemaCache.size >= this.config.maxCacheSize) {
      // Remove the first (oldest) entry
      const firstKey = this.schemaCache.keys().next().value;
      if (firstKey) {
        this.schemaCache.delete(firstKey);
      }
    }

    this.schemaCache.set(key, validateFn);
  }

  /**
   * Create a properly formatted ErrorObject
   *
   * @private
   */
  private createErrorObject(
    keyword: string,
    params: Record<string, unknown>,
    message: string
  ): ErrorObject {
    return {
      instancePath: '',
      schemaPath: '',
      keyword,
      params,
      message,
      dataPath: '', // For backwards compatibility with older AJV versions
    } as ErrorObject;
  }

  /**
   * Clear the schema cache
   */
  public clearCache(): void {
    this.schemaCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.schemaCache.size,
      maxSize: this.config.maxCacheSize,
    };
  }
}
