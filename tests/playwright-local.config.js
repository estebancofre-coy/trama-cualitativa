import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' },
});
