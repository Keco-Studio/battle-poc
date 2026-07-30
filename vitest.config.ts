import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@keco/battle-engine': path.resolve(
        __dirname,
        'packages/keco-battle-engine/src/index.ts',
      ),
    },
  },
  test: {
    /** Engine unit tests don't need browser; using node avoids jsdom conflicts with newer dependency chains ESM/CJS */
    environment: 'node',
    include: ['src/engine/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
