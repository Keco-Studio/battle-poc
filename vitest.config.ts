import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /** 引擎单测无需浏览器；用 node 可避免 jsdom 与新版依赖链的 ESM/CJS 冲突 */
    environment: 'node',
    include: ['src/engine/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
