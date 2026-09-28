import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const baseURL = process.env.LOCAL_TEST_URL || 'http://localhost:4028';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const failures = [];
page.on('pageerror', error => failures.push(error.message));
page.on('response', response => {
  if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
});

async function checkJson(url) {
  const response = await context.request.get(url, { timeout: 30_000 });
  assert.equal(response.status(), 200, `${url} did not return 200`);
  return (await response.json()).data;
}

try {
  const poolPath = '/nguon-nhan-luc/kho-ung-vien';
  await page.goto(poolPath, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Kho Ứng Viên', exact: true })).toBeVisible({ timeout: 45_000 });
  assert.equal(new URL(page.url()).pathname, poolPath, 'Local auto-login lost the requested page');
  const cvs = await checkJson('/api/hr/cv');
  const folders = await checkJson('/api/hr/cv/industries');
  await checkJson('/api/hr/requisitions');
  await expect(page.getByRole('heading', { name: 'Thư mục ngành nghề' })).toBeVisible({ timeout: 30_000 });
  console.log(`PASS: fresh login preserves Kho CV; ${cvs.length} CVs, ${folders.length} folders; all APIs return 200`);

  for (let i = 1; i <= 3; i++) {
    const start = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Thư mục ngành nghề' })).toBeVisible({ timeout: 20_000 });
    console.log(`PASS: Kho CV reload ${i}, UI ready in ${Date.now() - start}ms`);
  }

  await page.getByRole('link', { name: 'Tổng quan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tổng quan tuyển dụng' })).toBeVisible({ timeout: 30_000 });
  const overview = await checkJson('/api/hr/recruitment-dashboard');
  assert.equal(overview.mode, 'recruitment-focus');
  assert.equal(overview.cvs.total, cvs.length);
  await expect(page.getByText('Kết nối mất quá lâu. Vui lòng thử lại.')).toHaveCount(0);
  console.log(`PASS: overview loads real recruitment data (${overview.cvs.total} CVs) without personnel tables`);
  for (let i = 1; i <= 2; i++) {
    const start = Date.now();
    const dataLoaded = page.waitForResponse(response => response.url().includes('/api/hr/recruitment-dashboard') && response.status() === 200);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await dataLoaded;
    await expect(page.getByRole('heading', { name: 'Tổng quan tuyển dụng' })).toBeVisible();
    console.log(`PASS: overview reload ${i}, data ready in ${Date.now() - start}ms`);
  }
  const currentURL = page.url();
  await page.getByRole('button', { name: 'Thêm CV', exact: true }).click();
  await expect(page.locator('.candidate-add-modal')).toBeVisible({ timeout: 30_000 });
  assert.equal(page.url(), currentURL, 'Quick add navigated away from current screen');
  await page.locator('.candidate-add-modal button').first().click();
  console.log('PASS: quick-add opens on current page');

  mkdirSync('logs', { recursive: true });
  await page.screenshot({ path: 'logs/localhost-verified.png', fullPage: true });
  assert.deepEqual(failures, [], 'Browser runtime/network errors');

  const recoveryContext = await browser.newContext({ baseURL, storageState: await context.storageState() });
  const recovery = await recoveryContext.newPage();
  await recovery.route('**/api/auth/me', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'test failure' }) }));
  await recovery.goto(poolPath, { waitUntil: 'domcontentloaded' });
  await expect(recovery.getByText('Không thể mở Tuyển dụng', { exact: true })).toBeVisible({ timeout: 20_000 });
  await recovery.unroute('**/api/auth/me');
  await recovery.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(recovery.getByRole('heading', { name: 'Kho Ứng Viên', exact: true })).toBeVisible({ timeout: 20_000 });
  console.log('PASS: auth failure shows retry and recovers, without infinite spinner');
  await recoveryContext.close();

  const workerContext = await browser.newContext({ baseURL, storageState: await context.storageState() });
  const workerPage = await workerContext.newPage();
  await workerPage.goto(poolPath, { waitUntil: 'domcontentloaded' });
  await expect(workerPage.getByRole('heading', { name: 'Kho Ứng Viên', exact: true })).toBeVisible();
  await workerPage.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const cache = await caches.open('assetflow-v1');
    await cache.put('/_next/static/chunks/app/layout.js', new Response('throw new Error("stale assetflow cached chunk")', { headers: { 'Content-Type': 'application/javascript' } }));
  });
  await workerPage.reload({ waitUntil: 'domcontentloaded' }).catch(error => {
    if (!/interrupted|ERR_ABORTED/.test(error.message)) throw error;
  });
  await expect(workerPage.getByRole('heading', { name: 'Kho Ứng Viên', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => workerPage.evaluate(async () => (await caches.keys()).filter(key => key.startsWith('assetflow-')).length)).toBe(0);
  console.log('PASS: old application worker/cache is removed and Kho CV still loads');
  await workerContext.close();
} finally {
  await browser.close();
}
