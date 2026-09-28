import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:4028', viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('/nguon-nhan-luc/kho-ung-vien', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Thư mục ngành nghề' })).toBeVisible({ timeout: 30_000 });
  const response = await context.request.get('/api/hr/cv');
  assert.equal(response.status(), 200);
  const cvs = (await response.json()).data;
  const optionsResponse = await context.request.get('/api/hr/cv/filter-options');
  assert.equal(optionsResponse.status(), 200);
  const options = (await optionsResponse.json()).data;
  const degrees = ['Chưa tốt nghiệp THPT', 'Tốt nghiệp THPT', 'Chứng chỉ nghề', 'Trung cấp', 'Cao đẳng', 'Đại học', 'Sau đại học'];
  assert.deepEqual(options.educationLevels, degrees);
  for (const key of ['industries', 'skills', 'languages', 'educationLevels']) assert.ok(Array.isArray(options[key]));
  const unclassified = cvs.filter(cv => !cv.industry?.trim());
  assert.ok(unclassified.length > 0, 'Unclassified CVs needed for this read-only test');
  await page.getByRole('button', { name: /Chưa phân loại.*CV đang chờ phân loại/ }).click();
  const panel = page.getByRole('tabpanel');
  const rows = panel.locator('[data-candidate-id]');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(rows).toHaveCount(unclassified.length);

  let searchCount = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/hr/cv/search') searchCount++; });
  async function openFilter() {
    await page.getByRole('button', { name: /^Bộ lọc/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Bộ lọc', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Đang lấy tiêu chí từ Kho CV…', { exact: true })).toHaveCount(0);
    return dialog;
  }
  let dialog = await openFilter();
  await expect(dialog.getByRole('radio', { name: 'Thời gian tải CV lên', exact: true })).toBeChecked();
  await expect(dialog.getByText('Thời gian hoạt động', { exact: true })).toHaveCount(0);
  const timeOptions = dialog.getByRole('combobox', { name: 'Khoảng thời gian', exact: true }).locator('option');
  assert.deepEqual(await timeOptions.allTextContents(), ['Tất cả', 'Trong vòng 1 ngày', '1 Tuần gần đây', '1 Tháng gần đây', '2 Tháng gần đây']);
  await expect(dialog.locator('[data-time-option="uploaded"] select')).toHaveCount(1);
  await expect(dialog.locator('[data-time-option="updated"] select')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Khoảng thời gian', exact: true }).selectOption('7');
  await dialog.getByRole('radio', { name: 'Thời gian cập nhật CV', exact: true }).check();
  await expect(dialog.locator('[data-time-option="updated"] select')).toHaveValue('7');
  await expect(dialog.locator('[data-time-option="uploaded"] select')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Thời gian tải CV lên', exact: true }).check();
  await expect(dialog.locator('[data-time-option="uploaded"] select')).toHaveValue('7');
  await dialog.getByRole('combobox', { name: 'Khoảng thời gian', exact: true }).selectOption('');
  for (const key of ['experience', 'work', 'gender', 'languages', 'salary', 'age', 'education', 'job']) {
    const trigger = dialog.locator(`#cv-filter-trigger-${key}`);
    await trigger.click();
    await expect(dialog.locator('.cv-filter-section')).toHaveCount(1);
    const selected = dialog.locator(`#cv-filter-${key}`);
    await expect(selected).toBeVisible();
    assert.ok(await selected.evaluate(el => el.previousElementSibling?.contains(document.getElementById(el.getAttribute('aria-labelledby')))), 'Choices were not positioned directly below the selected criterion row');
    const triggerBounds = await trigger.boundingBox(), choiceBounds = await selected.boundingBox();
    assert.ok(choiceBounds.y >= triggerBounds.y + triggerBounds.height, 'Choices appeared above the selected criterion');
  }
  await dialog.getByRole('button', { name: 'Đóng tiêu chí Trạng thái tìm việc', exact: true }).click();
  await expect(dialog.locator('#cv-filter-trigger-job')).toBeFocused();
  console.log('PASS: time input follows the selected radio; each advanced criterion opens immediately below its own row');
  await dialog.getByRole('button', { name: 'Bằng cấp', exact: true }).click();
  assert.deepEqual(await dialog.locator('#cv-filter-education label').allTextContents(), degrees);
  await dialog.getByRole('button', { name: 'Bằng cấp', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Lưu bộ lọc', exact: true })).toBeDisabled();
  const before = searchCount;
  await dialog.getByRole('button', { name: 'Kinh nghiệm', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Kinh nghiệm từ', exact: true }).fill('3');
  await dialog.getByRole('spinbutton', { name: 'Kinh nghiệm đến', exact: true }).fill('10');
  assert.equal(searchCount, before, 'Editing draft unexpectedly queried the list');
  await expect(rows).toHaveCount(unclassified.length);
  await dialog.getByRole('button', { name: 'Lưu bộ lọc', exact: true }).click();
  await expect(dialog.getByText('Đã lưu bộ lọc trên máy này.', { exact: true })).toBeVisible();
  const appliedResponse = page.waitForResponse(response => response.url().endsWith('/api/hr/cv/search') && response.request().postDataJSON().minExperience === 3);
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  assert.equal((await appliedResponse).status(), 200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const expected = unclassified.filter(cv => cv.years_experience != null && cv.years_experience >= 3 && cv.years_experience <= 10);
  await expect(rows).toHaveCount(expected.length);
  assert.deepEqual(await rows.evaluateAll(elements => elements.map(el => el.dataset.candidateId).sort()), expected.map(cv => cv.id).sort());
  console.log('PASS: drawer matches the reference workflow; API options, draft/apply and saved presets work with real CV data');

  await page.locator('#cv-status-tab-offered').click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(rows).toHaveCount(expected.filter(cv => cv.status === 'offered').length);
  await page.getByRole('button', { name: 'Xóa lọc', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#cv-status-tab-offered')).toHaveAttribute('aria-selected', 'true');
  console.log('PASS: apply, status switch and clear filters never expose other status columns');

  dialog = await openFilter();
  await dialog.getByRole('button', { name: 'Kinh nghiệm', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Kinh nghiệm từ', exact: true }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Kinh nghiệm đến', exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Khoảng kinh nghiệm');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  dialog = await openFilter();
  await dialog.getByRole('button', { name: 'Dùng bộ lọc đã lưu', exact: true }).click();
  await dialog.getByRole('button', { name: 'Kinh nghiệm', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Kinh nghiệm từ', exact: true })).toHaveValue('3');
  await page.keyboard.press('Escape');
  console.log('PASS: invalid ranges are blocked; cancel discards edits; saved criteria can be restored');

  for (const body of [{ minAge: -1 }, { minSalary: 200, maxSalary: 100 }, { gender: 'invalid' },
    { employmentTypes: ['invalid'] }, { sortBy: 'invalid' }, { onlyUnviewed: 'true' }, { updatedWithinDays: '7' }, { educationLevels: ['FPT POLYTECH'] }]) {
    assert.equal((await context.request.post('/api/hr/cv/search', { data: body })).status(), 400, JSON.stringify(body));
  }
  for (const body of [{ languages: ['Tiếng Anh'] }, { gender: 'female' }, { employmentTypes: ['full_time'] },
    { minAge: 18, maxAge: 60 }, { minSalary: 1, maxSalary: 30_000_000 }, { educationLevels: options.educationLevels.slice(0, 1) },
    { jobSearchStatuses: ['actively_looking'] }, { sortBy: 'updated', updatedWithinDays: 7 }, { sortBy: 'uploaded', updatedWithinDays: 30 },
    { onlyUnviewed: true }]) {
    const result = await context.request.post('/api/hr/cv/search', { data: body });
    assert.equal(result.status(), 200, JSON.stringify(body));
    const data = (await result.json()).data;
    if (body.onlyUnviewed) assert.ok(data.every(cv => !cv.is_viewed));
  }
  console.log('PASS: every criterion reaches the protected API; invalid inputs return 400 rather than breaking localhost');

  for (const days of [1, 7, 30, 60]) {
    const response = await context.request.post('/api/hr/cv/search', { data: { sortBy: 'uploaded', updatedWithinDays: days } });
    assert.equal(response.status(), 200);
    const items = (await response.json()).data;
    assert.ok(items.every(item => item.uploaded_at === item.created_at));
    assert.ok(items.every(item => Date.now() - new Date(item.uploaded_at).getTime() <= days * 86400000 + 5000));
    const timestamps = items.map(item => new Date(item.uploaded_at).getTime());
    assert.deepEqual(timestamps, [...timestamps].sort((a, b) => b - a));
  }
  for (const degree of degrees) {
    const response = await context.request.post('/api/hr/cv/search', { data: { educationLevels: [degree] } });
    assert.equal(response.status(), 200);
    assert.ok((await response.json()).data.every(item => item.education_degree === degree));
  }
  console.log('PASS: seven degree choices and upload-time ranges match the reference and actual API metadata');

  dialog = await openFilter();
  await dialog.getByRole('combobox', { name: 'Ngành nghề', exact: true }).selectOption('*');
  await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(rows).toHaveCount(cvs.filter(cv => cv.status === 'offered').length);
  await page.locator('#cv-status-tab-all').click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(rows).toHaveCount(cvs.length);
  console.log('PASS: selecting All industries queries all folders while preserving the active status tab');

  dialog = await openFilter();
  await dialog.getByRole('button', { name: 'Bằng cấp', exact: true }).click();
  const desktopBounds = await page.getByRole('dialog').boundingBox();
  assert.equal(desktopBounds.y, 0, 'Drawer does not start at the top of the viewport');
  assert.equal(desktopBounds.height, 960, 'Drawer does not cover the viewport');
  await page.screenshot({ path: 'logs/cv-filter-drawer-verified.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Áp dụng', exact: true })).toBeInViewport();
  assert.ok(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth), 'Mobile drawer overflows');
  await page.screenshot({ path: 'logs/cv-filter-mobile-verified.png' });
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS: desktop/mobile layout, sticky actions and browser runtime checks');
} finally {
  await browser.close();
}
