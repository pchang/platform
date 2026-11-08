import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:4173' },
});
