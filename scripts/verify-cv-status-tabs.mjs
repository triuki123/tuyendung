import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

// Mixed-status fixtures are intercepted in the browser; no real CV is changed.
const baseURL = process.env.LOCAL_TEST_URL || 'http://localhost:4028';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const fileRequests = [];
const pdf = await PDFDocument.create();
pdf.addPage([595, 842]).drawText('Candidate CV - Talent Acquisition', { x: 50, y: 780, size: 18 });
const pdfBytes = Buffer.from(await pdf.save());
page.on('pageerror', error => errors.push(error.message));
const stages = [['new', 'Mới'], ['screening', 'Sàng lọc'], ['interviewed', 'Phỏng vấn'],
  ['offered', 'Đã offer'], ['hired', 'Đã Onboard'], ['rejected', 'Loại'], ['pool', 'Lưu kho']];

function cv(id, status, industry = null) {
  return { id, status, industry, candidate_name: `Ứng viên ${id}`, candidate_email: `${id}@example.test`,
    candidate_phone: '0901234567', position_applied: 'Chuyên viên tuyển dụng', current_title: 'Talent Acquisition',
    source: 'LinkedIn', note: null, file_name: `${id}.pdf`, size_bytes: 100,
    created_at: '2026-09-16T02:30:00.000Z', updated_at: '2026-09-16T02:30:00.000Z',
    skills: ['Tuyển dụng'], years_experience: 3, education_level: 'Đại học', education_degree: 'Đại học', expected_salary: null,
    location: 'Hồ Chí Minh', languages: [], rating: 4, tags: [], has_content: true };
}
const fixtures = [cv('new-one', 'new'), cv('new-two', 'new'), cv('screen-one', 'screening'),
  cv('screen-two', 'screening'), cv('interview-one', 'interviewed'), cv('onboard-one', 'hired'),
  cv('reject-one', 'rejected'), cv('pool-one', 'pool'), cv('other-folder', 'new', 'Nhân sự - Hành chính')];
let failNextNewSearch = false;
let holdScreening = false;
let releaseScreening;
let screeningHeld;
let heldSearchReady;

await context.addInitScript(() => {
  localStorage.setItem('candidate_pool_view', 'kanban');
  sessionStorage.setItem('candidate_pool_view', 'kanban');
});
await context.route('**/api/hr/requisitions*', route => route.fulfill({ json: { success: true,
  data: [{ id: 'req-test', title: 'Yêu cầu thử nghiệm', status: 'open' }] } }));
await context.route('**/api/hr/cv{,/**,?*}', async route => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (pathname === '/api/hr/cv') return route.fulfill({ json: { success: true, data: fixtures } });
  if (pathname === '/api/hr/cv/industries') return route.fulfill({ json: { success: true, data: [
    { id: '__unclassified', name: '', count: fixtures.filter(item => !item.industry).length },
    { id: 'hr-folder', name: 'Nhân sự - Hành chính', count: 1 },
  ] } });
  if (pathname === '/api/hr/cv/filter-options') return route.fulfill({ json: { success: true, data: {
    industries: ['Nhân sự - Hành chính'], skills: ['Tuyển dụng'], languages: [], educationLevels: ['Đại học'],
  } } });
  if (pathname === '/api/hr/cv/search') {
    const filter = request.postDataJSON();
    if (failNextNewSearch && filter.status === 'new') {
      failNextNewSearch = false;
      return route.fulfill({ status: 500, json: { error: 'Injected search failure' } });
    }
    const data = fixtures.filter(item => (!filter.status || item.status === filter.status)
      && (filter.industry === undefined || (item.industry || '') === filter.industry)
      && (!filter.keyword || item.candidate_name.includes(filter.keyword))
      && (!filter.requisitionId || item.id === 'new-one'));
    if (holdScreening && filter.status === 'screening') {
      holdScreening = false;
      heldSearchReady();
      await screeningHeld;
    }
    return route.fulfill({ json: { success: true, count: data.length, data } });
  }
  const id = pathname.split('/')[4];
  const candidate = fixtures.find(item => item.id === id);
  if (pathname.endsWith('/view') && candidate) {
    candidate.is_viewed = true;
    return route.fulfill({ json: { success: true } });
  }
  if (pathname.endsWith('/detail')) return route.fulfill({ json: { success: true,
    data: { cv: candidate, applications: [], notes: [], history: [], positionHistory: [] } } });
  if (request.method() === 'PUT' && candidate) {
    Object.assign(candidate, request.postDataJSON());
    return route.fulfill({ json: { success: true, data: candidate } });
  }
  if (request.method() === 'GET' && candidate && pathname === `/api/hr/cv/${id}`) {
    fileRequests.push(id);
    return route.fulfill({ contentType: 'application/pdf', body: pdfBytes });
  }
  throw new Error(`Unexpected CV API request: ${request.method()} ${pathname}`);
});

const panel = page.getByRole('tabpanel');
const rows = panel.locator('[data-candidate-id]');
async function select(key, expectedIds) {
  await page.locator(`#cv-status-tab-${key || 'all'}`).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(rows).toHaveCount(expectedIds.length);
  assert.deepEqual(await rows.evaluateAll(elements => elements.map(el => el.dataset.candidateId).sort()), [...expectedIds].sort());
  await expect(page.locator(`#cv-status-tab-${key || 'all'}`)).toHaveAttribute('aria-selected', 'true');
}
async function openUnclassified() {
  await expect(page.getByRole('heading', { name: 'Thư mục ngành nghề' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Chưa phân loại.*CV đang chờ phân loại/ }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(rows).toHaveCount(8);
}

try {
  await page.goto('/nguon-nhan-luc/kho-ung-vien', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await openUnclassified();
  await expect(page.getByTitle('Bảng Kanban')).toHaveCount(0);
  await expect(panel.getByText('Trống', { exact: true })).toHaveCount(0);
  const first = rows.filter({ has: page.getByRole('heading', { name: 'Ứng viên new-one', exact: true }) });
  for (const text of ['new-one@example.test', '0901234567', 'Chuyên viên tuyển dụng', 'Hồ Chí Minh', 'Đánh giá CV: 4/5']) {
    await expect(first.getByText(text, { exact: true })).toBeVisible();
  }
  console.log('PASS: All displays rich candidate rows, scoped to the folder, with no Kanban even when previously saved');

  await expect(first.getByText('Bằng cấp: Đại học', { exact: true })).toBeVisible();
  const upload = first.locator('[data-cv-uploaded-at]');
  const originalUploadTime = await upload.getAttribute('data-cv-uploaded-at');
  assert.deepEqual(fileRequests, [], 'Candidate list eagerly downloaded CV files');
  await first.click();
  await expect(page.locator('[data-cv-preview-id="new-one"] [data-preview-status="pdf"]')).toBeVisible();
  await expect(page.locator('iframe[title="new-one.pdf"]')).toBeVisible();
  assert.deepEqual(fileRequests, ['new-one'], 'Opening one CV downloaded other candidates');
  await expect(page.getByRole('button', { name: 'Xem', exact: true })).toHaveCount(0);
  const degreeField = page.getByRole('combobox', { name: 'Bằng cấp của ứng viên', exact: true });
  await expect(degreeField).toHaveValue('Đại học');
  await degreeField.selectOption('Sau đại học');
  const savedDegree = page.waitForRequest(request => request.method() === 'PUT' && new URL(request.url()).pathname === '/api/hr/cv/new-one');
  await page.getByRole('button', { name: 'Lưu thông tin', exact: true }).click();
  const savedBody = (await savedDegree).postDataJSON();
  assert.equal(savedBody.education_degree, 'Sau đại học');
  assert.equal(savedBody.education_level, 'Đại học', 'Saving degree overwrote raw education notes');
  await expect(first.getByText('Bằng cấp: Sau đại học', { exact: true })).toBeVisible();
  await expect(upload).toHaveAttribute('data-cv-uploaded-at', originalUploadTime);
  await page.keyboard.press('Escape');
  console.log('PASS: candidate degree dropdown, save API and outer CV information synchronize without changing upload time');

  for (const [key, label] of stages) {
    await select(key, fixtures.filter(item => !item.industry && item.status === key).map(item => item.id));
    await page.locator(`#cv-status-tab-${key}`).click();
    await expect(page.locator(`#cv-status-tab-${key}`)).toHaveAttribute('aria-selected', 'true');
    if (key === 'offered') await expect(panel.getByText(`Chưa có hồ sơ ở trạng thái “${label}”`, { exact: true })).toBeVisible();
  }
  console.log('PASS: every status tab shows only its own CVs; empty tab stays empty; repeated click does not reset to All');

  const offeredFixture = cv('offer-one', 'offered');
  fixtures.push(offeredFixture);
  await select('offered', ['offer-one']);
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(panel).toHaveAttribute('data-active-status', 'offered');
  await expect(panel.getByRole('heading', { name: 'Hồ sơ · Đã offer', exact: true })).toBeVisible();
  await expect(panel.getByText('Trống', { exact: true })).toHaveCount(0);
  assert.deepEqual(await rows.evaluateAll(elements => elements.map(el => el.dataset.status)), ['offered']);
  fixtures.splice(fixtures.indexOf(offeredFixture), 1);
  console.log('PASS: a populated Offer tab mounts only its own information region, without other status columns');

  await select('new', ['new-one', 'new-two']);
  await page.getByRole('button', { name: 'Chọn nhiều', exact: true }).click();
  await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
  await expect(page.getByText('2 CV đã chọn', { exact: true })).toBeVisible();
  await select('screening', ['screen-one', 'screen-two']);
  await expect(page.getByText('0 CV đã chọn', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
  await expect(page.getByText('2 CV đã chọn', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xong', exact: true }).click();
  console.log('PASS: bulk selection is limited to the active tab and cleared when switching tabs');

  await rows.first().click();
  await expect(page.getByLabel('Chuyển hồ sơ')).toContainText('1/2');
  await expect(page.locator('iframe[title="screen-one.pdf"]')).toBeVisible();
  await page.getByRole('button', { name: 'Hồ sơ tiếp theo', exact: true }).click();
  await expect(page.getByLabel('Chuyển hồ sơ')).toContainText('2/2');
  await expect(page.locator('iframe[title="screen-two.pdf"]')).toBeVisible();
  await expect(page.locator('iframe[title="screen-one.pdf"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hồ sơ tiếp theo', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  console.log('PASS: drawer navigation stays within the selected status');

  const search = page.getByPlaceholder('Tìm theo tên, kỹ năng, vị trí, hoặc nội dung bên trong CV (không dấu cũng được)...');
  await search.fill('screen-one');
  await expect(rows).toHaveCount(1);
  await select('new', []);
  await expect(panel.getByText('Không tìm thấy ứng viên phù hợp', { exact: true })).toBeVisible();
  await select('screening', ['screen-one']);
  await search.fill('');
  await expect(rows).toHaveCount(2);
  await select('new', ['new-one', 'new-two']);
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  const filterDialog = page.getByRole('dialog', { name: 'Bộ lọc', exact: true });
  await filterDialog.getByText('Tiêu chí khác của Kho CV', { exact: true }).click();
  await filterDialog.getByRole('combobox', { name: 'Theo yêu cầu tuyển dụng', exact: true }).selectOption('req-test');
  await filterDialog.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await select('hired', []);
  await page.getByRole('button', { name: 'Xóa lọc', exact: true }).click();
  await expect(page.locator('#cv-status-tab-hired')).toHaveAttribute('aria-selected', 'true');
  await select('', fixtures.filter(item => !item.industry).map(item => item.id));
  await expect(rows).toHaveCount(8);
  console.log('PASS: keyword and requisition filters combine with status tabs without introducing a per-job Kanban');

  // Hold one server response while the user selects another tab.
  await select('new', ['new-one', 'new-two']);
  holdScreening = true;
  screeningHeld = new Promise(resolve => { releaseScreening = resolve; });
  const held = new Promise(resolve => { heldSearchReady = resolve; });
  await page.locator('#cv-status-tab-screening').click();
  await held;
  await select('new', ['new-one', 'new-two']);
  const slowResponse = page.waitForResponse(response => response.url().endsWith('/api/hr/cv/search')
    && response.request().postDataJSON().status === 'screening');
  releaseScreening();
  await slowResponse;
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(rows).toHaveCount(2);
  assert.deepEqual(await rows.evaluateAll(elements => elements.map(el => el.dataset.status)), ['new', 'new']);
  console.log('PASS: delayed responses cannot overwrite the currently selected tab');

  await select('hired', ['onboard-one']);
  failNextNewSearch = true;
  await page.locator('#cv-status-tab-new').click();
  await expect(page.getByText('Không tải được danh sách ứng viên. Vui lòng thử lại.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Thử lại/ }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.locator('#cv-status-tab-new')).toHaveAttribute('aria-selected', 'true');
  console.log('PASS: a failed search can be retried without losing the selected tab');

  // Status change only touches the intercepted fixture, not the database.
  await rows.first().click();
  await expect(page.getByLabel('Chuyển hồ sơ')).toContainText('1/2');
  await page.getByRole('button', { name: 'Sàng lọc', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByLabel('Chuyển hồ sơ')).toHaveCount(0);
  await select('screening', ['new-one', 'screen-one', 'screen-two']);
  console.log('PASS: changing a CV status removes it from its previous tab and shows it in the correct one');

  await page.locator('#cv-status-tab-screening').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#cv-status-tab-interviewed')).toHaveAttribute('aria-selected', 'true');
  await expect(rows).toHaveCount(1);
  console.log('PASS: status tabs support keyboard navigation');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openUnclassified();
  await expect(page.getByTitle('Bảng Kanban')).toHaveCount(0);
  assert.deepEqual(errors, [], 'Unexpected browser errors');
  await page.screenshot({ path: 'logs/cv-status-tabs-verified.png', fullPage: true });
  console.log('PASS: reload keeps the new list-based interface');

  const realContext = await browser.newContext({ baseURL, storageState: await context.storageState() });
  const realPage = await realContext.newPage();
  try {
    await realPage.goto('/nguon-nhan-luc/kho-ung-vien', { waitUntil: 'domcontentloaded' });
    await expect(realPage.getByRole('heading', { name: 'Thư mục ngành nghề' })).toBeVisible();
    const folderButton = realPage.getByRole('button', { name: /Chưa phân loại.*CV đang chờ phân loại/ });
    if (await folderButton.count()) {
      await folderButton.click();
      const realPanel = realPage.getByRole('tabpanel');
      await expect(realPanel).toHaveAttribute('aria-busy', 'false');
      const realRows = realPanel.locator('[data-candidate-id]');
      const originalCount = await realRows.count();
      assert.ok(originalCount > 0, 'Real unclassified folder did not display its CVs');
      const originalItems = await realRows.evaluateAll(elements => elements.map(el => ({ id: el.dataset.candidateId, status: el.dataset.status })));
      for (const [key] of stages) {
        await realPage.locator(`#cv-status-tab-${key}`).click();
        await expect(realPanel).toHaveAttribute('aria-busy', 'false');
        await expect(realPage.getByRole('tabpanel')).toHaveCount(1);
        await expect(realPanel).toHaveAttribute('data-active-status', key);
        const expectedIds = originalItems.filter(item => item.status === key).map(item => item.id).sort();
        await expect(realRows).toHaveCount(expectedIds.length);
        assert.deepEqual(await realRows.evaluateAll(elements => elements.map(el => el.dataset.candidateId).sort()), expectedIds);
        if (key === 'offered') {
          await expect(realPanel.getByText('Trống', { exact: true })).toHaveCount(0);
          await realPage.screenshot({ path: 'logs/cv-offer-tab-verified.png', fullPage: true });
          console.log(`PASS: real Offer tab displays only its ${expectedIds.length} offered CVs, with no other status columns`);
        }
      }
      await realPage.locator('#cv-status-tab-all').click();
      await expect(realPanel).toHaveAttribute('aria-busy', 'false');
      await expect(realRows).toHaveCount(originalCount);
      console.log(`PASS: all seven real status tabs display only their own region; All restores ${originalCount} unclassified CVs`);
    } else {
      console.log('PASS: real localhost folder index loads (no unclassified CVs available for the read-only smoke test)');
    }
  } finally {
    await realContext.close();
  }
} finally {
  releaseScreening?.();
  await browser.close();
}
