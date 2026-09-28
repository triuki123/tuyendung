import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://localhost:4028/nguon-nhan-luc/fdv', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /FADO Visions/ }).waitFor({ timeout: 60000 });
  await page.getByText('AI chưa được kích hoạt.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Hỏi FDV', exact: true }).first().click();
  await page.getByPlaceholder('Hỏi về ngành, nghiệp vụ TA hoặc tra cứu thông tin cập nhật…').fill('Kỹ năng TA');
  await page.getByRole('button', { name: 'Công việc & nhắc hạn' }).click();
  await page.getByRole('heading', { name: 'Thêm công việc' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No mobile overflow');
  await page.getByRole('button', { name: 'Phân tích CV', exact: true }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No analysis mobile overflow');
  console.log('PASS FDV desktop tabs, missing-key notice and mobile layout.');
} finally { await browser.close(); }
