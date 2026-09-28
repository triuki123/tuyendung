import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const saved = [];
  await page.route('**/api/hr/jd', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postData(); saved.push(body);
      await route.fulfill({ json: { success: true, data: { id: String(saved.length), title: `Saved JD ${saved.length}`, status: 'draft', created_at: new Date().toISOString() } } });
    } else await route.fulfill({ json: { success: true, data: [] } });
  });
  await page.route('**/api/hr/jd/extract', async route => {
    const second = route.request().postData().includes('second.pdf');
    await route.fulfill({ json: { success: true, data: { fields: { title: second ? 'Marketing' : 'Accountant', duties: second ? 'Marketing duties' : 'Accounting duties' }, warnings: [] } } });
  });
  await page.goto('http://localhost:4028/nguon-nhan-luc/kho-mo-ta-cong-viec');
  await page.getByRole('button', { name: 'Thêm bản mô tả công việc mới' }).click();
  await page.locator('input[type=file]').setInputFiles([
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: Buffer.from('first') },
    { name: 'second.pdf', mimeType: 'application/pdf', buffer: Buffer.from('second') },
  ]);
  const title = page.getByPlaceholder('Tiêu đề JD *');
  await page.getByText('2 JD chưa lưu · Mỗi file là một JD riêng').waitFor();
  assert.equal(await title.inputValue(), 'Accountant');
  await title.fill('Edited Accountant');
  await page.getByRole('button', { name: '2. second.pdf' }).click();
  assert.equal(await title.inputValue(), 'Marketing');
  await page.getByRole('button', { name: '1. first.pdf' }).click();
  assert.equal(await title.inputValue(), 'Edited Accountant');
  await page.getByRole('button', { name: 'Lưu JD (2)' }).click();
  await title.waitFor({ state: 'hidden' });
  assert.equal(saved.length, 2);
  assert(saved[0].includes('Accounting duties') && !saved[0].includes('Marketing duties'));
  assert(saved[1].includes('Marketing duties') && !saved[1].includes('Accounting duties'));
  for (const body of saved) assert.match(body, /name="status"\r\n\r\ndraft/);
  await page.getByRole('button', { name: 'Nháp (2)' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Nháp (2)' }).getAttribute('aria-pressed'), 'true');
  console.log('PASS: independent extraction, preserved edits, separate files and saves. No database writes.');
} finally { await browser.close(); }
