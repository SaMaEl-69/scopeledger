import { defineConfig } from '@playwright/test';
import site from './playwright.site.config';

export default defineConfig({
  ...site,
  outputDir: './test-results/cloudflare',
  reporter: [
    ['list'],
    ['json', { outputFile: 'output/deployment/cloudflare-browser-results.json' }],
  ],
  use: { ...site.use, baseURL: process.env.SCOPELEDGER_SITE_URL || 'http://127.0.0.1:8787' },
  webServer: undefined,
});
