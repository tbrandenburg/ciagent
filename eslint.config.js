import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': 'off', // Use @typescript-eslint version instead
      'no-console': 'off', // Allow console in CLI applications
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': 'error',
      'curly': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', 'bun.lock'],
  },
];