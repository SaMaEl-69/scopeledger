import { defineConfig } from '@playwright/test';
import audit from './playwright.audit.config';

export default defineConfig({
  ...audit,
  testDir: './tests/site',
  outputDir: './test-results/site',
  timeout: 60000,
  reporter: [['list'], ['json', { outputFile: 'output/audit/multipage-site-results.json' }]],
  use: { ...audit.use, reducedMotion: 'reduce' },
});
