import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let aiCalls = 0;
  await page.route('**/api/hr/fdv', async route => {
    if (route.request().method() === 'POST') {
      aiCalls++;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Demo must not call AI' }) });
    } else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { configured: false } }) });
  });
  await page.goto('http://localhost:4028/nguon-nhan-luc/fdv', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Chế độ Demo', exact: true }).click({ timeout: 60000 });
  await page.getByRole('button', { name: 'Chấm phù hợp & đề xuất' }).click();
  await page.getByText('DEMO · BÁO CÁO GIẢ LẬP — KHÔNG DÙNG ĐÁNH GIÁ ỨNG VIÊN THẬT').waitFor();
  await page.getByText('78/100', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('CV ứng viên').inputValue(), 'demo-cv');
  await page.getByRole('button', { name: 'Chỉ tóm tắt CV' }).click();
  assert.equal(await page.getByText('78/100', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Hỏi FDV', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Câu hỏi cho FDV' }).fill('Test câu hỏi công khai');
  await page.getByRole('checkbox', { name: 'Tra cứu web cập nhật, có nguồn' }).check();
  await page.getByRole('button', { name: 'Hỏi FDV', exact: true }).last().click();
  await page.getByText('DEMO · CÂU TRẢ LỜI GIẢ LẬP').waitFor();
  await page.getByText('DEMO — Không thực hiện tra cứu web.', { exact: false }).waitFor();
  assert.equal(aiCalls, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile should not overflow');
  await page.getByRole('button', { name: 'Tắt chế độ Demo', exact: true }).click();
  assert.equal(await page.getByText('DEMO · CÂU TRẢ LỜI GIẢ LẬP').count(), 0);
  await page.getByRole('button', { name: 'Phân tích CV', exact: true }).click();
  assert.equal(await page.getByLabel('CV ứng viên').inputValue(), '');
  assert.equal(await page.getByText('DEMO · BÁO CÁO GIẢ LẬP — KHÔNG DÙNG ĐÁNH GIÁ ỨNG VIÊN THẬT').count(), 0);
  console.log('PASS demo analysis, summary, web disclaimer, zero AI calls, mobile, reset on exit.');
} finally { await browser.close(); }
