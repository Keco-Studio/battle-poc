import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  use: {
    baseURL: 'http://localhost:3000',
  },
});