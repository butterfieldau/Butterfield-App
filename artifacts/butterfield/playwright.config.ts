import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:80`;

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 430, height: 932 },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
