import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/cli/tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'dev/**'],
    testTimeout: 10000, // Increase timeout for reliability tests with retry delays
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['packages/cli/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/tests/**'],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 40,
        statements: 40,
      },
    },
  },
});
