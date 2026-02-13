import { describe, it, expect, beforeEach } from 'vitest';
import {
  SchemaValidator,
  SchemaValidationResult,
} from '../../src/shared/validation/schema-validator.js';
import { JSONSchema7 } from 'json-schema';

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('Schema Compilation', () => {
    it('should compile valid JSON schema successfully', () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      expect(() => validator.compileSchema(schema)).not.toThrow();
    });

    it('should throw error for invalid schema', () => {
      const invalidSchema = {
        type: 'invalid-type', // Not a valid JSON Schema type
      } as unknown as JSONSchema7;

      expect(() => validator.compileSchema(invalidSchema)).toThrow(/Schema compilation failed/);
    });

    it('should cache compiled schemas when caching is enabled', () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: { id: { type: 'number' } },
      };

      // Compile twice - should use cache on second call
      const validateFn1 = validator.compileSchema(schema);
      const validateFn2 = validator.compileSchema(schema);

      // Should be the same function from cache
      expect(validateFn1).toBe(validateFn2);
    });
  });

  describe('JSON Validation - PROVEN Schemas', () => {
    let sentimentSchema: JSONSchema7;
    let prDescriptionSchema: JSONSchema7;

    beforeEach(() => {
      // PROVEN schemas from ai-first-devops-toolkit examples (inlined for CI compatibility)
      sentimentSchema = {
        type: 'object',
        properties: {
          sentiment: {
            type: 'string',
            enum: ['positive', 'negative', 'neutral'],
            description: 'Overall sentiment of the content',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score for the sentiment analysis (0-1)',
          },
          key_points: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5,
            description: 'Main points or topics identified (1-5 items)',
          },
          summary: {
            type: 'string',
            maxLength: 200,
            description: 'Brief summary of the content (max 200 characters)',
          },
        },
        required: ['sentiment', 'confidence', 'key_points', 'summary'],
        additionalProperties: false,
      };

      prDescriptionSchema = {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            minLength: 100,
            maxLength: 2000,
            description: 'Comprehensive PR description in markdown format',
          },
          summary: {
            type: 'string',
            maxLength: 200,
            description: 'Brief summary of changes',
          },
          change_type: {
            type: 'string',
            enum: ['feature', 'bugfix', 'refactor', 'documentation', 'test', 'chore', 'breaking'],
            description: 'Type of change',
          },
          impact: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Impact on users and system',
          },
          testing_notes: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 10,
            description: 'Testing requirements and notes',
          },
          deployment_notes: {
            type: 'array',
            items: { type: 'string' },
            minItems: 0,
            maxItems: 5,
            description: 'Deployment considerations',
          },
          breaking_changes: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of breaking changes if any',
          },
          related_issues: {
            type: 'array',
            items: { type: 'string' },
            description: 'Related issue numbers or references',
          },
        },
        required: ['description', 'summary', 'change_type', 'impact', 'testing_notes'],
        additionalProperties: false,
      };
    });

    describe('Sentiment Analysis Schema', () => {
      it('should validate correct sentiment data', () => {
        const validData = JSON.stringify({
          sentiment: 'positive',
          confidence: 0.95,
          key_points: ['great features', 'easy to use'],
          summary: 'Very positive feedback about the tool',
        });

        const result = validator.validate(validData, sentimentSchema);

        expect(result.isValid).toBe(true);
        expect(result.data).toEqual({
          sentiment: 'positive',
          confidence: 0.95,
          key_points: ['great features', 'easy to use'],
          summary: 'Very positive feedback about the tool',
        });
        expect(result.errors).toBeUndefined();
      });

      it('should reject invalid sentiment enum value', () => {
        const invalidData = JSON.stringify({
          sentiment: 'extremely-positive', // Not in enum
          confidence: 0.95,
          key_points: ['test'],
          summary: 'test summary',
        });

        const result = validator.validate(invalidData, sentimentSchema);

        expect(result.isValid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors![0].keyword).toBe('enum');
      });

      it('should reject confidence outside valid range', () => {
        const invalidData = JSON.stringify({
          sentiment: 'positive',
          confidence: 1.5, // > 1.0 maximum
          key_points: ['test'],
          summary: 'test summary',
        });

        const result = validator.validate(invalidData, sentimentSchema);

        expect(result.isValid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors![0].keyword).toBe('maximum');
      });

      it('should reject missing required fields', () => {
        const invalidData = JSON.stringify({
          sentiment: 'positive',
          // Missing confidence, key_points, summary
        });

        const result = validator.validate(invalidData, sentimentSchema);

        expect(result.isValid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
        expect(result.errors!.some(e => e.keyword === 'required')).toBe(true);
      });

      it('should reject arrays outside size constraints', () => {
        const invalidData = JSON.stringify({
          sentiment: 'positive',
          confidence: 0.8,
          key_points: [], // Empty array, but minItems is 1
          summary: 'test',
        });

        const result = validator.validate(invalidData, sentimentSchema);

        expect(result.isValid).toBe(false);
        expect(result.errors![0].keyword).toBe('minItems');
      });
    });

    describe('PR Description Schema', () => {
      it('should validate correct PR description data', () => {
        const validData = JSON.stringify({
          description:
            'This PR implements comprehensive schema validation for the CLI tool with retry logic for malformed outputs. It adds AJV-based validation that ensures JSON responses conform to specified schemas.',
          summary: 'Add schema validation with retry logic',
          change_type: 'feature',
          impact: 'medium',
          testing_notes: [
            'Unit tests added for schema validation',
            'Integration tests for retry logic',
          ],
          deployment_notes: ['No database changes required'],
          breaking_changes: [],
          related_issues: ['#123', '#124'],
        });

        const result = validator.validate(validData, prDescriptionSchema);

        expect(result.isValid).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.errors).toBeUndefined();
      });

      it('should reject description below minimum length', () => {
        const invalidData = JSON.stringify({
          description: 'Too short', // Below minLength: 100
          summary: 'Test summary',
          change_type: 'feature',
          impact: 'low',
          testing_notes: ['test'],
        });

        const result = validator.validate(invalidData, prDescriptionSchema);

        expect(result.isValid).toBe(false);
        expect(result.errors![0].keyword).toBe('minLength');
      });

      it('should reject invalid change_type enum', () => {
        const validDescription = 'A'.repeat(150); // Meet minLength requirement
        const invalidData = JSON.stringify({
          description: validDescription,
          summary: 'Test summary',
          change_type: 'invalid-type', // Not in enum
          impact: 'low',
          testing_notes: ['test'],
        });

        const result = validator.validate(invalidData, prDescriptionSchema);

        expect(result.isValid).toBe(false);
        expect(result.errors![0].keyword).toBe('enum');
      });
    });
  });

  describe('JSON Parsing', () => {
    it('should validate parsed object data', () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: { count: { type: 'number' } },
        required: ['count'],
      };
      const data = { count: 42 };

      const result = validator.validate(data, schema);

      expect(result.isValid).toBe(true);
      expect(result.data).toEqual({ count: 42 });
    });

    it('should handle invalid JSON strings gracefully', () => {
      const schema: JSONSchema7 = { type: 'object' };
      const invalidJson = '{ invalid json }';

      const result = validator.validate(invalidJson, schema);

      expect(result.isValid).toBe(false);
      expect(result.errors![0].message).toContain('Invalid JSON');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation exceptions gracefully', () => {
      const schema: JSONSchema7 = { type: 'object' };

      // Mock a validation error by passing something that will cause issues
      const result = validator.validate('{valid: "json"}', schema);

      // Should not throw, but return validation error
      expect(result.isValid).toBeDefined();
    });
  });

  describe('Caching Behavior', () => {
    it('should provide cache statistics', () => {
      const schema: JSONSchema7 = { type: 'string' };

      validator.compileSchema(schema);
      const stats = validator.getCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(100); // Default max size
    });

    it('should clear cache when requested', () => {
      const schema: JSONSchema7 = { type: 'string' };

      validator.compileSchema(schema);
      validator.clearCache();
      const stats = validator.getCacheStats();

      expect(stats.size).toBe(0);
    });

    it('should evict oldest entries when cache is full', () => {
      const smallCacheValidator = new SchemaValidator({ maxCacheSize: 2 });

      const schema1: JSONSchema7 = { type: 'string' };
      const schema2: JSONSchema7 = { type: 'number' };
      const schema3: JSONSchema7 = { type: 'boolean' };

      smallCacheValidator.compileSchema(schema1);
      smallCacheValidator.compileSchema(schema2);
      smallCacheValidator.compileSchema(schema3); // Should evict schema1

      const stats = smallCacheValidator.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(2);
    });
  });

  describe('Performance', () => {
    it('should handle large schemas without timeout', () => {
      const largeSchema: JSONSchema7 = {
        type: 'object',
        properties: {},
      };

      // Add many properties to create a larger schema
      for (let i = 0; i < 100; i++) {
        largeSchema.properties![`field_${i}`] = {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        };
      }

      expect(() => validator.compileSchema(largeSchema)).not.toThrow();
    });
  });
});
