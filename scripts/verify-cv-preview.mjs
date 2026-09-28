import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

// All CVs, view records and files below are browser fixtures, never DB writes.
const require = createRequire(import.meta.url);
const JSZip = createRequire(require.resolve('mammoth'))('jszip');
const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Candidate DOCX - Talent Acquisition</w:t></w:r></w:p></w:body></w:document>');
const pdf = await PDFDocument.create();
pdf.addPage([595, 842]).drawText('Candidate CV - Talent Acquisition', { x: 50, y: 780, size: 18 });
const pdfBytes = Buffer.from(await pdf.save());
const files = {
  pdf: { name: 'Candidate.pdf', mime: 'text/plain', body: pdfBytes },
  image: { name: 'Candidate.png', mime: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ioAAAAASUVORK5CYII=', 'base64') },
  word: { name: 'Candidate.docx', mime: 'application/octet-stream', body: await zip.generateAsync({ type: 'nodebuffer' }) },
  text: { name: 'Candidate.txt', mime: 'text/plain', body: Buffer.from('Ứng viên tuyển dụng\nKinh nghiệm: 3 năm\nEmail: candidate@example.test') },
  retry: { name: 'Retry.pdf', mime: 'application/pdf', body: pdfBytes },
  slow: { name: 'Slow.pdf', mime: 'application/pdf', body: pdfBytes },
  unsupported: { name: 'Candidate.bin', mime: 'application/octet-stream', body: Buffer.from([0, 1, 2]) },
};
const fixtures = [...Object.keys(files), 'no-file'].map(id => ({ id, candidate_name: `Ứng viên ${id}`, candidate_email: `${id}@example.test`,
  candidate_phone: '0901234567', position_applied: 'Talent Acquisition', current_title: null, industry: null, status: 'new',
  source: 'Upload', note: null, file_name: files[id]?.name || null, mime_type: files[id]?.mime || null,
  size_bytes: files[id]?.body.length || null, has_content: Boolean(files[id]), skills: [], languages: [], tags: [], rating: null,
  created_at: '2026-09-16T02:30:00.000Z', updated_at: '2026-09-16T02:30:00.000Z' }));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ baseURL: process.env.LOCAL_TEST_URL || 'http://localhost:4028', viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], requested = [], aborted = [];
let failRetry = true, releaseSlow, slowReady;
const held = new Promise(resolve => { releaseSlow = resolve; });
const slowStarted = new Promise(resolve => { slowReady = resolve; });
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => { if (request.url().endsWith('/api/hr/cv/slow')) aborted.push(request.failure()?.errorText); });
await context.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  window.cvPreviewUrls = new Set();
  URL.createObjectURL = blob => { const url = create(blob); window.cvPreviewUrls.add(url); return url; };
  URL.revokeObjectURL = url => { window.cvPreviewUrls.delete(url); revoke(url); };
});
await context.route('**/api/hr/requisitions*', route => route.fulfill({ json: { success: true, data: [] } }));
await context.route('**/api/hr/cv{,/**,?*}', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  const json = data => route.fulfill({ json: { success: true, data } });
  if (path === '/api/hr/cv') return json(fixtures);
  if (path === '/api/hr/cv/industries') return json([{ id: '__unclassified', name: '', count: fixtures.length }]);
  if (path === '/api/hr/cv/search') return json(fixtures);
  const id = path.split('/')[4], candidate = fixtures.find(cv => cv.id === id);
  if (path.endsWith('/view') && candidate) return json(null);
  if (path.endsWith('/detail') && candidate) return json({ cv: candidate, notes: [], history: [], positionHistory: [],
    applications: id === 'pdf' ? [{ id: 'app-fixture', cv_id: id, requisition_id: 'req-fixture', requisition_title: 'TA tuyển dụng', status: 'new', created_at: candidate.created_at }] : [] });
  if (path === `/api/hr/cv/${id}` && files[id]) {
    requested.push(id);
    if (id === 'retry' && failRetry) { failRetry = false; return route.fulfill({ status: 500 }); }
    if (id === 'slow') { slowReady(); await held; }
    try { return await route.fulfill({ contentType: files[id].mime, body: files[id].body }); }
    catch (error) { if (id !== 'slow') throw error; }
  }
  throw new Error(`Unexpected fixture request: ${request.method()} ${path}`);
});
const dialog = page.getByRole('dialog');
const viewer = dialog.locator('.file-preview-content');
async function open(id) {
  await page.getByRole('tabpanel').locator(`[data-candidate-id="${id}"]`).click();
  await expect(dialog).toBeVisible();
}
async function close() {
  await page.getByRole('button', { name: 'Đóng hồ sơ ứng viên', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.cvPreviewUrls.size)).toBe(0);
}
try {
  await page.goto('/nguon-nhan-luc/kho-ung-vien', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Thư mục ngành nghề' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Chưa phân loại.*CV đang chờ phân loại/ }).click();
  await expect(page.getByRole('tabpanel').locator('[data-candidate-id]')).toHaveCount(fixtures.length);
  assert.deepEqual(requested, [], 'List eagerly downloaded CV files');
  await open('pdf');
  await expect(viewer).toHaveAttribute('data-preview-status', 'pdf');
  await expect(dialog.locator('iframe[title="Candidate.pdf"]')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Xem', exact: true })).toHaveCount(0);
  await expect(dialog.getByText('TA tuyển dụng', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(1); // A linked application must not hide the CV behind another drawer.
  assert.deepEqual(requested, ['pdf']);
  const cvBounds = await dialog.locator('.candidate-detail-cv').boundingBox();
  const infoBounds = await dialog.locator('.candidate-detail-info').boundingBox();
  assert.ok(cvBounds.x + cvBounds.width <= infoBounds.x + 1, 'Desktop CV is not next to the editable profile');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'logs/cv-preview-desktop-verified.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.locator('iframe[title="Candidate.pdf"]')).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Đóng hồ sơ ứng viên', exact: true })).toBeInViewport();
  assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'Mobile sheet overflows horizontally');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'logs/cv-preview-mobile-verified.png' });
  await close();
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS: CV opens automatically beside editable information, including linked applicants; desktop/mobile layouts fit');

  for (const [id, status] of [['image', 'image'], ['word', 'word'], ['text', 'text']]) {
    await open(id);
    await expect(viewer).toHaveAttribute('data-preview-status', status, { timeout: 30_000 });
    if (id === 'image') await expect.poll(() => viewer.locator('img').evaluate(el => el.naturalWidth)).toBe(1);
    if (id === 'word') {
      await expect(viewer.locator('iframe')).toHaveAttribute('sandbox', '');
      await expect(viewer.frameLocator('iframe').getByText('Candidate DOCX - Talent Acquisition')).toBeVisible();
    }
    if (id === 'text') await expect(viewer.getByText('Ứng viên tuyển dụng', { exact: false })).toBeVisible();
    await close();
  }
  console.log('PASS: actual PDF bytes, image, sandboxed DOCX and text previews render without a View click');
  await open('retry');
  await expect(viewer).toHaveAttribute('data-preview-status', 'error');
  await viewer.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-preview-status', 'pdf');
  await close();
  await open('unsupported');
  await expect(viewer).toHaveAttribute('data-preview-status', 'unsupported');
  await expect(viewer.getByRole('button', { name: 'Tải về để mở', exact: true })).toBeVisible();
  await close();
  await open('no-file');
  await expect(dialog.getByText('Hồ sơ này chưa có tệp CV đính kèm.', { exact: true })).toBeVisible();
  await expect(viewer).toHaveCount(0);
  await close();
  console.log('PASS: retry recovers failed file loads; unsupported/missing files have clear fallback information');

  await open('slow');
  await slowStarted;
  await page.getByRole('button', { name: 'Hồ sơ trước', exact: true }).click(); // Previous fixture: retry.
  await expect(dialog.locator('[data-cv-preview-id="retry"] [data-preview-status="pdf"]')).toBeVisible();
  releaseSlow();
  await expect.poll(() => aborted.length).toBeGreaterThan(0);
  await expect(dialog.locator('iframe[title="Slow.pdf"]')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.cvPreviewUrls.size), 1, 'Navigation leaked a blob URL');
  await close();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Thư mục ngành nghề' })).toBeVisible();
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log('PASS: navigation aborts the old file, cannot display a stale CV, releases blob URLs and survives reload');
} finally {
  releaseSlow();
  await browser.close();
}
