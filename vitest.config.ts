import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/engine/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
