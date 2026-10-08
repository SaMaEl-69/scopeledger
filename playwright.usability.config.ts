import { defineConfig } from '@playwright/test';
import cross from './playwright.cross.config';
import audit from './playwright.audit.config';

export default defineConfig({
  ...cross,
  testMatch: [
    'workspace-ease.spec.ts',
    'workspace-shortcuts.spec.ts',
    'document-ease.spec.ts',
    'project-sequence.spec.ts',
  ],
  outputDir: './test-results/usability',
  reporter: [['list'], ['json', { outputFile: 'output/audit/usability-browser-results.json' }]],
  use: { ...cross.use, baseURL: 'http://127.0.0.1:4173', reducedMotion: 'reduce' },
  webServer: audit.webServer,
});
