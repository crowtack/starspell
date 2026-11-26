import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/rules/**/*.ts'],
      exclude: ['src/rules/**/*.test.ts'],
      thresholds: {
        lines: 95,
      },
    },
  },
});
