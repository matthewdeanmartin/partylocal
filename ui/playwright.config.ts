import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.pw.ts', timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4316', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node ../tools/serve-demo.mjs 4316', url: 'http://127.0.0.1:4316/clubhouse/', reuseExistingServer: false },
});

