import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './test-results/browser',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    timezoneId: 'Asia/Dhaka',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROME_PATH ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/app',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
