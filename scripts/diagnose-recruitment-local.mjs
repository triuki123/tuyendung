import { chromium } from '@playwright/test';

const baseURL = process.env.LOCAL_TEST_URL || 'http://localhost:4028';
let browser;
for (const options of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]) {
  try {
    browser = await chromium.launch({ ...options, headless: true });
    break;
  } catch (error) {
    console.log(`Browser ${options.channel || 'chromium'}: ${error.message.split('\n')[0]}`);
  }
}
if (!browser) throw new Error('No browser available for localhost verification');

const context = await browser.newContext({ baseURL });
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') console.log(`CONSOLE ${message.type()}: ${message.text().slice(0, 1000)}`);
});
page.on('pageerror', (error) => console.log(`PAGE ERROR: ${error.message}`));
page.on('requestfailed', (request) => console.log(`FAILED: ${request.url()} ${request.failure()?.errorText}`));
page.on('response', async (response) => {
  const url = new URL(response.url());
  if (url.pathname.startsWith('/api/') || response.status() >= 400) {
    console.log(`RESPONSE: ${response.status()} ${url.pathname}`);
    if (response.status() >= 400 && url.pathname.startsWith('/api/')) {
      console.log((await response.text().catch(() => '')).slice(0, 300));
    }
  }
});

try {
  for (const path of ['/nguon-nhan-luc/kho-ung-vien']) {
    const start = Date.now();
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.locator('.recruitment-shell').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
    console.log(`PAGE: ${path} ${Date.now() - start}ms; current=${new URL(page.url()).pathname}`);
    console.log(`BODY: ${(await page.locator('body').innerText()).slice(0, 700)}`);
    console.log(`RUNTIME: ${JSON.stringify(await page.evaluate(() => ({ ready: document.readyState, scripts: [...document.scripts].map(s => s.src).filter(Boolean), entries: performance.getEntriesByType('resource').map(e => ({ name: e.name, duration: Math.round(e.duration) })) })))}`);
    await page.waitForTimeout(1000);
  }
  for (let i = 1; i <= 2; i++) {
    const start = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('.recruitment-shell').waitFor({ timeout: 15_000 }).catch(() => {});
    console.log(`RELOAD ${i}: ${Date.now() - start}ms; shell=${await page.locator('.recruitment-shell').count()}`);
  }
} finally {
  await browser.close();
}
