// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * JiayiCare Playwright 配置
 * - 本地跑时对接 Expo Web (http://localhost:8081)
 * - CI / 验收时对接已部署的 Vercel 地址
 *
 * 用法：
 *   本地：  npx playwright test
 *   生产：  BASE_URL=https://dist-lfy4f9p8l-jiayihui.vercel.app npx playwright test
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:8081';

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 顺序跑，避免共享 localStorage 互相干扰

  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14 尺寸
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/reports/html' }],
  ],

  outputDir: 'tests/reports/artifacts',
});
