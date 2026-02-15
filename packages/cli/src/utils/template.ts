/**
 * Template processing utilities for variable substitution.
 *
 * Supports simple {{variable}} syntax for template processing without
 * complex template engine dependencies, following the environment variable
 * substitution pattern from config/loader.ts.
 */

/**
 * Process a template string by substituting variables with values.
 *
 * Uses Mustache-style {{variable}} syntax for variable placeholders.
 * Undefined variables are kept as placeholders with a console warning,
 * following the same pattern as environment variable substitution.
 *
 * @param templateContent - The template string with {{variable}} placeholders
 * @param variables - Record of variable names to replacement values
 * @returns Processed string with variables substituted
 *
 * @example
 * ```typescript
 * const template = "Hello {{name}}, welcome to {{app}}!";
 * const vars = { name: "John", app: "CIA CLI" };
 * const result = processTemplate(template, vars);
 * // Returns: "Hello John, welcome to CIA CLI!"
 * ```
 */
export function processTemplate(
  templateContent: string,
  variables: Record<string, string>
): string {
  return templateContent.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const trimmedVarName = varName.trim();
    const value = variables[trimmedVarName];

    if (value === undefined) {
      console.error(
        `Warning: Template variable ${trimmedVarName} is not defined, keeping placeholder`
      );
      return match;
    }

    return String(value);
  });
}

/**
 * Process template variables recursively for nested objects and arrays.
 *
 * This extends the basic processTemplate function to handle complex data structures
 * while maintaining the same variable substitution logic.
 *
 * @param obj - The object, array, or string to process
 * @param variables - Record of variable names to replacement values
 * @returns Processed data structure with variables substituted
 */
export function processTemplateVariables<T>(obj: T, variables: Record<string, string>): T {
  if (typeof obj === 'string') {
    return processTemplate(obj, variables) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => processTemplateVariables(item, variables)) as T;
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = processTemplateVariables(value, variables);
    }
    return result as T;
  }

  return obj;
}
