import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import { cvTestLoader } from './cv-test-loader.mjs';

const load = cvTestLoader();
const { createJdPdf } = load('src/lib/services/jdPdf.ts');
const { extractCvText } = load('src/lib/services/cvExtract.ts');
const bytes = await createJdPdf({ title: 'Chuyên viên tuyển dụng', department_name: null, description: '【Khung lương】\n20000000\n\n【Mô tả công việc】\nTuyển nhân sự' });
const text = await extractCvText(Buffer.from(bytes), 'application/pdf', 'test-jd.pdf');
assert.match(text, /TUYỂN DỤNG:/);
assert.match(text, /20\.000\.000 Triệu Đồng/);
const pdf = await PDFDocument.load(bytes);
const fonts = pdf.getPages()[0].node.Resources().lookup(PDFName.of('Font'), PDFDict);
assert(fonts.values().some(value => /TimesNewRoman/i.test(pdf.context.lookup(value).get(PDFName.of('BaseFont')).toString())));
console.log('PASS PDF: recruitment header, Times New Roman embedded, Vietnamese salary.');

let analyzed = false;
const result = { translation: 'Kinh nghiệm làm việc\nChuyên viên tuyển dụng — tuyển 30 nhân sự.', summary: 'Có kinh nghiệm thực tế tuyển dụng.', suggestions: [{ role: 'Chuyên viên TA', evidence: 'Recruited 30 staff', jd_id: 'jd-test', gaps: 'Cần xác minh phạm vi tuyển' }], verification: ['Xác minh kết quả'], compared: 1, totalJds: 1, truncated: false };
const dummyKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'test-not-a-real-key';
try {
  const route = cvTestLoader({ '@/lib/fdvAccess': { canFdv: () => true }, '@/lib/db': { withTransaction: async fn => fn({ query: async () => ({ rows: [{ count: '0' }] }) }) }, '@/lib/services/hrPoolService': { getCvById: async () => ({ id: 'cv-test', candidate_name: 'Test' }), getCvText: async () => 'Employment History\nRecruited 30 staff\nEmail: test@example.test', listJds: async () => [{ id: 'jd-test', title: 'Chuyên viên TA', description: 'Tuyển nhân sự' }] }, '@/lib/services/fdvService': { callFdv: async (input, instructions) => { analyzed = true; assert(!input.includes('test@example.test')); assert(instructions.includes('kinh nghiệm')); return { text: JSON.stringify(result) }; } } })('src/app/api/hr/fdv/route.ts');
  const { NextRequest } = await import('next/server.js');
  const request = consent => new NextRequest('http://localhost/api/hr/fdv', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-current-user-id': 'test' }, body: JSON.stringify({ mode: 'translate', cvId: 'cv-test', consent }) });
  assert.equal((await route.POST(request(false))).status, 400); assert.equal(analyzed, false);
  const response = await route.POST(request(true)); assert.equal(response.status, 200); assert.equal((await response.json()).data.translation, result.translation);
  console.log('PASS translation API: consent, minimized data, experience-based suggestions; provider mocked.');
} finally { if (dummyKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = dummyKey; }

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  await page.route('**/api/hr/interviews?*', r => r.fulfill({ json: { data: [{ id: 'test-event', scheduled_at: `${today}T23:00:00+07:00`, duration_min: 60, status: 'scheduled', candidate_name: 'Ứng viên kiểm thử', round_label: 'Vòng 1', requisition_title: 'TA', mode: 'online' }] } }));
  await page.goto('http://localhost:4028/nguon-nhan-luc/lich-phong-van');
  const widget = page.getByRole('region', { name: 'Lịch phỏng vấn hôm nay' });
  await widget.getByText('Ứng viên kiểm thử', { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await widget.getByRole('button', { name: 'Thêm lịch', exact: true }).click();
  await page.getByText('Tạo lịch phỏng vấn', { exact: true }).waitFor();
  console.log('PASS Today widget: agenda, mobile, opening creation. No DB writes or real AI calls.');
  await page.route('**/api/hr/cv{,/**,?*}', async r => {
    const path = new URL(r.request().url()).pathname;
    const cv = { id: 'cv-test', candidate_name: 'Ứng viên kiểm thử CV', candidate_email: 'test@example.test', status: 'new', industry: null, file_name: 'test.pdf', mime_type: 'application/pdf', skills: [], languages: [], tags: [], created_at: new Date().toISOString() };
    if (path === '/api/hr/cv/industries') return r.fulfill({ json: { data: [{ id: '__unclassified', name: '', count: 1 }] } });
    if (path.endsWith('/detail')) return r.fulfill({ json: { data: { cv, applications: [], notes: [], history: [], positionHistory: [] } } });
    if (path.endsWith('/view')) return r.fulfill({ json: { data: null } });
    if (path === '/api/hr/cv/cv-test') return r.fulfill({ contentType: 'application/pdf', body: Buffer.from(bytes) });
    if (path.endsWith('/filter-options')) return r.fulfill({ json: { data: { industries: [], skills: [], languages: [], educationLevels: [] } } });
    return r.fulfill({ json: { data: [cv] } });
  });
  let calls = 0;
  await page.route('**/api/hr/fdv', r => { calls++; return r.fulfill({ json: { data: result } }); });
  await page.goto('http://localhost:4028/nguon-nhan-luc/kho-ung-vien');
  await page.getByRole('button', { name: /Chưa phân loại.*CV đang chờ phân loại/ }).click();
  await page.locator('[data-candidate-id="cv-test"]').click();
  const insights = page.getByRole('region', { name: 'Đọc CV tiếng Việt và gợi ý vị trí' });
  const analyze = insights.getByRole('button', { name: 'Dịch CV & gợi ý vị trí' });
  assert.equal(await analyze.isDisabled(), true); assert.equal(calls, 0);
  await insights.getByRole('checkbox').check(); await analyze.click();
  await insights.getByText('Chuyên viên TA', { exact: true }).waitFor();
  assert.equal(calls, 1);
  assert(await page.locator('.candidate-detail-cv-content').evaluate(node => node.getBoundingClientRect().height > 100));
  console.log('PASS CV insights UI: consent, separate Vietnamese translation and suggestions; original viewer remains visible.');
} finally { await browser.close(); }
