import { test, Page } from '@playwright/test';

/** Chụp vài trang ở LIGHT để duyệt mắt thường (lưu test-results/light, không commit). */
const PAGES = ['dashboard', 'tickets', 'room-bookings'];

async function seedLight(page: Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('assetflow_theme', 'light'); } catch { /* noop */ }
  });
}

test.describe('Light shots', () => {
  for (const name of PAGES) {
    test(name, async ({ page }) => {
      await seedLight(page);
      await page.goto(`/${name}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      await page.evaluate(() => document.documentElement.classList.add('light'));
      await page.waitForTimeout(600);
      await page.screenshot({
        path: `test-results/light/${name}.png`,
        clip: { x: 0, y: 0, width: 1440, height: 1100 },
      });
    });
  }
});
