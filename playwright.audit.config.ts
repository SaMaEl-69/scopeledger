import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/audit',
  outputDir: './test-results/audit',
  timeout: 180000,
  expect: { timeout: 10000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'output/audit/responsive-browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Dhaka',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath:
            process.env.PLAYWRIGHT_CHROME_PATH ??
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        },
      },
    },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:4173/app',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
