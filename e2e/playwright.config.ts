import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration.
 *
 * The suite runs against the static export served by a plain file server, with
 * the PHP APIs replaced by route fixtures (see tests/fixtures.ts). That keeps
 * CI free of PHP and MySQL while still exercising every piece of behaviour the
 * frontend owns: routing, the product modal's URL contract, pagination, form
 * validation and the mobile menu.
 *
 * Chromium and WebKit are covered because the audience is heavily iOS; each
 * runs at a desktop and an iPhone-sized viewport.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },

  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL,
    // Artefacts only for failures — a green run should leave nothing behind.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },

  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'webkit-desktop',   use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } } },
    { name: 'chromium-mobile',  use: { ...devices['Pixel 7'] } },
    { name: 'webkit-mobile',    use: { ...devices['iPhone 14'] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `node server.mjs ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
