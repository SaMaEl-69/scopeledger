import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/local-browser',
  outputDir: './test-results/local-browser',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'output/audit/local-browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Asia/Dhaka',
    trace: 'off',
    screenshot: 'only-on-failure',
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
});
