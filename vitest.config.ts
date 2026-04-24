import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /** Engine unit tests don't need browser; using node avoids jsdom conflicts with newer dependency chains ESM/CJS */
    environment: 'node',
    include: ['src/engine/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
