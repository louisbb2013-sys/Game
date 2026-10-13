import { defineConfig, devices } from '@playwright/test';

// Run `npm run dev` first. CHROMIUM_PATH lets you reuse a pre-installed browser.
export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:5173',
    ...devices['Pixel 7'],
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
});
