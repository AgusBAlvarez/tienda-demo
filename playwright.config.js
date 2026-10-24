// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  globalSetup: './tests/global-setup.js',
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5500/elbaul/public/admin',
    video: 'on',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});