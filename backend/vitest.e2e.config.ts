import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    exclude: ['node_modules', 'dist', 'src/**'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
