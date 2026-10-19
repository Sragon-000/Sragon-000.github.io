import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  globalTimeout: 5 * 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5290/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 5290 --strictPort',
      url: 'http://127.0.0.1:5290/',
      reuseExistingServer: false,
      env: { PAGES_BASE: '/' },
    },
    {
      command: 'npm run dev -- --port 5291 --strictPort',
      url: 'http://127.0.0.1:5291/portfolio/',
      reuseExistingServer: false,
      env: { PAGES_BASE: '/portfolio/' },
    },
  ],
});
