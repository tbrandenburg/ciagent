import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { processTemplate, processTemplateVariables } from '../../src/utils/template.js';

describe('Template Processing', () => {
  const testOutputDir = '/tmp/cia-template-tests';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('processTemplate', () => {
    it('should substitute basic variables correctly', () => {
      const template = 'Hello {{name}}, welcome to {{app}}!';
      const variables = { name: 'John', app: 'CIA CLI' };

      const result = processTemplate(template, variables);

      expect(result).toBe('Hello John, welcome to CIA CLI!');
    });

    it('should handle templates with no variables', () => {
      const template = 'This is a plain text template without variables';
      const variables = {};

      const result = processTemplate(template, variables);

      expect(result).toBe('This is a plain text template without variables');
    });

    it('should handle empty templates', () => {
      const template = '';
      const variables = { name: 'John' };

      const result = processTemplate(template, variables);

      expect(result).toBe('');
    });

    it('should handle undefined variables by keeping placeholder and warning', () => {
      const template = 'Hello {{name}}, your {{role}} is important!';
      const variables = { name: 'John' };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = processTemplate(template, variables);

      expect(result).toBe('Hello John, your {{role}} is important!');
      expect(errorSpy).toHaveBeenCalledWith(
        'Warning: Template variable role is not defined, keeping placeholder'
      );
    });

    it('should handle variables with whitespace in variable names', () => {
      const template = 'Hello {{ name }}, welcome to {{ app }}!';
      const variables = { name: 'John', app: 'CIA CLI' };

      const result = processTemplate(template, variables);

      expect(result).toBe('Hello John, welcome to CIA CLI!');
    });

    it('should handle malformed variable syntax by keeping malformed parts as-is', () => {
      const template = 'Hello {{incomplete, this should stay: {{name}}';
      const variables = { name: 'John', incomplete: 'test' };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = processTemplate(template, variables);

      // The regex matches the entire {{incomplete, this should stay: {{name}} as one variable
      // Since there's no variable with that name, it stays as-is and shows a warning
      expect(result).toBe('Hello {{incomplete, this should stay: {{name}}');
      expect(errorSpy).toHaveBeenCalledWith(
        'Warning: Template variable incomplete, this should stay: {{name is not defined, keeping placeholder'
      );
    });

    it('should handle variables with special characters in values', () => {
      const template = 'Path: {{path}}, Message: {{message}}';
      const variables = {
        path: '/home/user/special-chars!@#$%^&*()',
        message: 'Hello "world" & <test>',
      };

      const result = processTemplate(template, variables);

      expect(result).toBe(
        'Path: /home/user/special-chars!@#$%^&*(), Message: Hello "world" & <test>'
      );
    });

    it('should handle repeated variables correctly', () => {
      const template = '{{name}} said "Hello {{name}}" to {{name}}';
      const variables = { name: 'Alice' };

      const result = processTemplate(template, variables);

      expect(result).toBe('Alice said "Hello Alice" to Alice');
    });

    it('should convert non-string variable values to strings', () => {
      const template = 'Count: {{count}}, Active: {{active}}, Price: {{price}}';
      const variables = {
        count: '42',
        active: 'true',
        price: '99.99',
      };

      const result = processTemplate(template, variables);

      expect(result).toBe('Count: 42, Active: true, Price: 99.99');
    });

    it('should handle nested JSON values in variables', () => {
      const template = 'Config: {{config}}, List: {{items}}';
      const variables = {
        config: '{"debug": true, "port": 3000}',
        items: '["item1", "item2", "item3"]',
      };

      const result = processTemplate(template, variables);

      expect(result).toBe(
        'Config: {"debug": true, "port": 3000}, List: ["item1", "item2", "item3"]'
      );
    });

    it('should handle large template content', () => {
      const template = 'Start {{var}} ' + 'x'.repeat(10000) + ' {{var}} End';
      const variables = { var: 'TEST' };

      const result = processTemplate(template, variables);

      expect(result).toBe('Start TEST ' + 'x'.repeat(10000) + ' TEST End');
      expect(result.length).toBe(10000 + 20); // "Start TEST " + 10000 x's + " TEST End"
    });
  });

  describe('processTemplateVariables', () => {
    it('should process string values recursively', () => {
      const input = 'Hello {{name}}!';
      const variables = { name: 'World' };

      const result = processTemplateVariables(input, variables);

      expect(result).toBe('Hello World!');
    });

    it('should process arrays recursively', () => {
      const input = ['Hello {{name}}', 'Welcome to {{app}}'];
      const variables = { name: 'John', app: 'CIA CLI' };

      const result = processTemplateVariables(input, variables);

      expect(result).toEqual(['Hello John', 'Welcome to CIA CLI']);
    });

    it('should process objects recursively', () => {
      const input = {
        greeting: 'Hello {{name}}',
        app: 'Welcome to {{app}}',
        nested: {
          message: 'Your {{role}} is important',
        },
      };
      const variables = { name: 'John', app: 'CIA CLI', role: 'contribution' };

      const result = processTemplateVariables(input, variables);

      expect(result).toEqual({
        greeting: 'Hello John',
        app: 'Welcome to CIA CLI',
        nested: {
          message: 'Your contribution is important',
        },
      });
    });

    it('should handle non-string primitive values unchanged', () => {
      const input = {
        str: 'Hello {{name}}',
        num: 42,
        bool: true,
        null_val: null,
        undef_val: undefined,
      };
      const variables = { name: 'World' };

      const result = processTemplateVariables(input, variables);

      expect(result).toEqual({
        str: 'Hello World',
        num: 42,
        bool: true,
        null_val: null,
        undef_val: undefined,
      });
    });
  });
});
