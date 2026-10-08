import { defineConfig } from '@playwright/test';
import audit from './playwright.audit.config';
export default defineConfig({
  ...audit,
  testDir: './tests/browser',
  outputDir: './test-results/cross-browser',
  timeout: 60000,
  reporter: [['list'], ['json', { outputFile: 'output/audit/workflow-browser-results.json' }]],
  use: { ...audit.use, baseURL: 'http://127.0.0.1:5173' },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/app',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
