import { defineConfig, devices } from '@playwright/test';

const phone = (width: number, height: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width, height },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5179',
    // Pin "today" to a scheduled day so runs are repeatable.
    timezoneId: 'America/New_York',
  },
  webServer: {
    // The production build: realistic, and the worker loads as one bundle instead of
    // hundreds of dev modules.
    command: 'pnpm exec vite build && pnpm exec vite preview --port 5179 --strictPort',
    url: 'http://localhost:5179',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'phone-360x640', use: phone(360, 640) },
    { name: 'phone-375x667', use: phone(375, 667) },
    { name: 'phone-390x844', use: phone(390, 844) },
    { name: 'phone-430x932', use: phone(430, 932) },
    { name: 'tablet-768x1024', use: phone(768, 1024) },
    {
      name: 'desktop-1280x800',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
