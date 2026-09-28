import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const path of ['tinh-hinh-tuyen-dung','yeu-cau-tuyen-dung','kho-ung-vien','kho-mo-ta-cong-viec','email-tuyen-dung','lich-phong-van']) {
    await page.goto(`http://localhost:4028/nguon-nhan-luc/${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.recruitment-apple main').waitFor({ timeout: 45000 });
    assert.equal(await page.locator('.recruitment-nav [aria-current="page"]').count(), 1);
    console.log('PASS desktop:', path);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:4028/nguon-nhan-luc');
  await page.locator('.recruitment-apple main').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Page must not overflow mobile viewport');
  console.log('PASS mobile: no horizontal page overflow');
} finally { await browser.close(); }
