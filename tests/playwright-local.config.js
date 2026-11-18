import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './local',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' },
});
