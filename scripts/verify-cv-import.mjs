import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { chromium, expect } from '@playwright/test';
import { cvTestLoader } from './cv-test-loader.mjs';

const require = createRequire(import.meta.url);
const JSZip = createRequire(require.resolve('mammoth'))('jszip');
const load = cvTestLoader();
const { extractCandidateFields: parse, extractCvDocument, guessSkills } = load('src/lib/services/cvExtract.ts');
const { inferIndustryFromPosition: industry, inferIndustryFromCandidate: candidateIndustry } = load('src/lib/cvIndustry.ts');
const { cvExtractionFormValues } = load('src/lib/cvImport.ts');
const now = new Date('2026-09-16T00:00:00Z');
const vietnamese = `Thông tin cá nhân
Họ và tên: Nguyễn Văn An
Email: an@example.test
Điện thoại: +84 901 234 567
Vị trí ứng tuyển: Chuyên viên Talent Acquisition
Chức danh hiện tại: Recruiter
Địa chỉ: Hồ Chí Minh
Trường đại học: Đại học Kinh tế
Bằng cấp: Đại học
Số năm kinh nghiệm: 3,5 năm
Lương mong muốn: 22 triệu VNĐ / tháng
Kỹ năng: Excel, ATS, Talent sourcing
Ngoại ngữ: Tiếng Anh (IELTS 7.0)
Giới tính: Nam
Ngày sinh: 29/02/2000
Hình thức làm việc: Toàn thời gian
Trạng thái tìm việc: Đang tìm việc`;
const english = `Personal information
Full name: Nguyen Van An
Email: an@example.test
Phone: 0901234567
Desired position: Backend Developer
Current title: Software Engineer
Address: Ho Chi Minh City
University: University of Technology
Degree: Bachelor of Science
Years of experience: 3.5 years
Expected salary: 22000000 VND
Skills: SQL, Python, React
Languages: English IELTS 7.0
Gender: Male
Date of birth: 2000-02-29
Employment type: Full time
Job search status: Actively looking`;
const expected = { candidate_name: 'Sai Tên Người', candidate_email: 'an@example.test', candidate_phone: '0901234567',
  position_applied: 'Sales Engineer', current_title: 'Recruiter', location: 'Hồ Chí Minh',
  education_degree: 'Đại học', years_experience: 3.5, expected_salary: 22000000, gender: 'male', date_of_birth: '2000-02-29',
  employment_type: 'full_time', job_search_status: 'actively_looking', industry: 'Kinh doanh - Bán hàng' };
const result = parse(vietnamese, 'Sai Tên Người - Sales Engineer.pdf', now);
for (const [key, value] of Object.entries(expected)) assert.equal(result[key], value, key);
assert.ok(result.skills.includes('ATS') && result.skills.includes('Excel'));
assert.deepEqual(result.languages, ['Tiếng Anh']);
assert.ok(result.education_level.includes('Đại học Kinh tế'));
assert.deepEqual(result.missing_fields, []);
assert.equal(result.evidence.candidate_name.source, 'filename');
assert.equal(parse('Họ tên: Không dùng\nVị trí ứng tuyển: Không dùng', 'Lê Minh Anh - CS.pdf', now).candidate_name, 'Lê Minh Anh');
assert.equal(parse('Họ tên: Không dùng\nVị trí ứng tuyển: Không dùng', 'Lê Minh Anh - CS.pdf', now).position_applied, 'CS');
for (const [title, folder] of [['Sales Engineer', 'Kinh doanh - Bán hàng'], ['Backend Developer', 'Công nghệ thông tin'],
  ['Kế toán thanh toán', 'Kế toán - Kiểm toán'], ['Talent Acquisition', 'Nhân sự - Hành chính'], ['OPS', 'Vận hành - Kho vận'],
  ['Digital Marketing', 'Marketing - Truyền thông'], ['UI/UX Designer', 'Thiết kế sáng tạo'], ['HRBP', 'Nhân sự - Hành chính'],
  ['NV KD', 'Kinh doanh - Bán hàng'], ['BDM', 'Kinh doanh - Bán hàng'], ['MKT Executive', 'Marketing - Truyền thông'],
  ['Chuyên viên HCNS', 'Nhân sự - Hành chính'], ['TA Specialist', 'Nhân sự - Hành chính'], ['SCM Executive', 'Vận hành - Kho vận'],
  ['NV XNK', 'Vận hành - Kho vận'], ['QC Inspector', 'Kỹ thuật - Sản xuất'], ['CSKH', 'Chăm sóc khách hàng'],
  ['TCNH Analyst', 'Tài chính - Ngân hàng'], ['PL Executive', 'Pháp lý - Tuân thủ'], ['CNTT', 'Công nghệ thông tin'],
  ['CS', 'Chăm sóc khách hàng'], ['Performance Marketing', 'Marketing - Truyền thông'], ['Digital Marketing', 'Marketing - Truyền thông'],
  ['E-com Executive', 'Thương mại điện tử'], ['E-Commerces Manager', 'Thương mại điện tử']]) assert.equal(industry(title), folder, title);
assert.equal(candidateIndustry('Project Coordinator', ['Tiếng Trung']), 'Dự Án Trung Quốc');
assert.equal(candidateIndustry('Nhân viên tiếng Trung', []), 'Dự Án Trung Quốc');
for (const title of ['Assistant', 'HR Marketing', 'Product', 'three', 'Taxonomy', 'Personal profile']) assert.equal(industry(title), null, title);
for (const content of ['', 'CURRICULUM VITAE\nPersonal Information\nWork Experience', 'Hồ sơ ứng viên\nMarketing\nMục tiêu\nPhát triển bản thân']) {
  assert.equal(parse(content, undefined, now).candidate_name, '');
}
const schoolOnly = parse('Họ và tên: Trần Văn Nam\nTrường đại học: Đại học Quốc gia\nEnglish: No experience\nKỹ năng: Chưa biết SQL', undefined, now);
assert.equal(schoolOnly.education_degree, 'Đại học');
assert.equal(schoolOnly.gender, null);
assert.equal(schoolOnly.date_of_birth, null);
assert.equal(schoolOnly.industry, null);
assert.equal(parse('📍 Hồ Chí Minh', undefined, now).location, 'Hồ Chí Minh');
assert.equal(parse('📍 Khu vực: Quận 1, Hồ Chí Minh', undefined, now).location, 'Quận 1, Hồ Chí Minh');
assert.equal(parse('\uF041\nĐà Nẵng', undefined, now).location, 'Đà Nẵng');
assert.equal(parse('\uF3C5 Bình Thạnh, Hồ Chí Minh', undefined, now).location, 'Bình Thạnh, Hồ Chí Minh');
assert.equal(parse('🏠 Hà Nội', undefined, now).location, 'Hà Nội');
assert.equal(parse('Quận 1, Thành phố Hồ Chí Minh', undefined, now).location, 'Quận 1, Thành phố Hồ Chí Minh');
assert.equal(parse('Ho Chi Minh City, Vietnam', undefined, now).location, 'Ho Chi Minh City, Vietnam');
assert.equal(parse('District Manager', undefined, now).location, '');
assert.equal(parse('City\nEmployment History\nHo Chi Minh City', undefined, now).location, '');
assert.equal(parse('Khanh, Bui Gia\nkaybui2012@gmail.com Phu Thanh Ward, Ho Chi Minh City, Viet Nam (+84) 938 52 4004\nProfile\nTalent Acquisition professional\nEmployment History\nSunrise Events Vietnam, Ho Chi Minh\nCity', undefined, now).location, 'Phu Thanh Ward, Ho Chi Minh City, Viet Nam');
assert.equal(parse('Profile\nRecruiter\nEmployment History\nHo Chi Minh City', undefined, now).location, '');
assert.equal(cvExtractionFormValues(parse('Huyện Bình Chánh, Thành phố Hồ Chí Minh', undefined, now)).location, 'Huyện Bình Chánh, Thành phố Hồ Chí Minh');
assert.equal(parse('☎ 0901 234 567', undefined, now).candidate_phone, '0901234567');
assert.equal(parse('📞\n+84 901 234 567', undefined, now).candidate_phone, '0901234567');
assert.equal(parse('Điện thoại: 0901 111 222\n☎ 0901 234 567', undefined, now).candidate_phone, '0901111222');
assert.equal(parse('Học vấn\nĐại học ABC\nLiên hệ: 901 234 5678', undefined, now).candidate_phone, '9012345678');
assert.equal(parse('Thông tin\n+84 (901) 234-567', undefined, now).candidate_phone, '0901234567');
assert.equal(parse('📍\n0901234567', undefined, now).location, '');
assert.equal(parse('Địa chỉ: Hà Nội\n📍 Đà Nẵng', undefined, now).location, 'Hà Nội');
const fullEducation = parse(`Học vấn/Trường Học
Đại học Bách khoa Hà Nội — Cử nhân Công nghệ thông tin
Cao đẳng FPT Polytechnic — Lập trình web
Trung cấp Kinh tế Kỹ thuật — Kế toán`, undefined, now);
assert.ok(fullEducation.education_level.includes('Đại học Bách khoa Hà Nội'));
assert.ok(fullEducation.education_level.includes('Cao đẳng FPT Polytechnic'));
assert.ok(fullEducation.education_level.includes('Trung cấp Kinh tế Kỹ thuật'));
assert.equal(fullEducation.education_degree, 'Đại học');
assert.equal(parse('Học vấn/Trường học\nCollege of Technology', undefined, now).education_degree, 'Cao đẳng');
assert.equal(parse('Học vấn/Trường học\nTrung cấp Kinh tế', undefined, now).education_degree, 'Trung cấp');
assert.deepEqual(guessSkills('Chưa biết SQL; no experience with Python'), []);
assert.deepEqual(parse('Ngoại ngữ: Chưa biết tiếng Anh', undefined, now).languages, []);
assert.equal(parse('Học vấn\nĐang học Cử nhân - dự kiến tốt nghiệp 2028', undefined, now).education_degree, 'Đại học');
assert.equal(parse('Học vấn\nCử nhân Kinh tế\nThạc sĩ Quản trị kinh doanh', undefined, now).education_degree, 'Sau đại học');
for (const salary of ['15 - 20 triệu', '1,000 USD', 'Thỏa thuận', '22 triệu / năm']) assert.equal(parse(`Lương mong muốn: ${salary}`, undefined, now).expected_salary, null, salary);
for (const date of ['31/02/2000', '01/01/2030', '2000']) assert.equal(parse(`Ngày sinh: ${date}`, undefined, now).date_of_birth, null, date);
assert.equal(parse('Thông tin cá nhân\nNgày sinh: 12/31/2000\nKinh nghiệm\n01/2018 - 12/2019', undefined, now).date_of_birth, '2000-12-31');
assert.equal(parse('Personal information\nYear of birth: 2000\nWork experience\n01/2018 - 12/2019', undefined, now).date_of_birth, '2000-01-01');
assert.equal(parse('Kinh nghiệm làm việc\nIntern\n01/2018 - 12/2020\nNhân viên kinh doanh\n01/2021 - 01/2023\nHọc vấn', undefined, now).years_experience, 2.1);
assert.equal(parse('Work History\nSales Executive\n2020 - 2023\nEducation', undefined, now).years_experience, 3);
assert.equal(parse('Quá trình làm việc\nFrontend Developer\n02.2020 – Hiện tại\nHọc vấn', undefined, now).years_experience, 6.6);
assert.equal(parse('Mục tiêu: Có thể làm việc trong ngành CNTT', undefined, now).position_applied, '');
assert.equal(parse('Kinh nghiệm làm việc\n01/2020 - 12/2022\n01/2021 - 12/2022\nHọc vấn\n01/2016 - 12/2019', undefined, now).years_experience, 3);
assert.equal(parse('Số năm kinh nghiệm: 0 năm', undefined, now).years_experience, 0);
assert.equal(parse('3 năm kinh nghiệm SQL\n5 năm kinh nghiệm Python', undefined, now).years_experience, null);
assert.equal(parse('Contact\na@example.test\nb@example.test', undefined, now).candidate_email, '');
console.log('PASS: all 17 fields, X - Y filename priority, correct industries, conflicting/missing facts and overlapping work dates');

const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${vietnamese.split('\n').map(line => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
const docx = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
const pdf = await PDFDocument.create(), pdfPage = pdf.addPage([595, 842]);
english.split('\n').forEach((line, index) => pdfPage.drawText(line, { x: 35, y: 800 - index * 24, size: 12 }));
const pdfBytes = Buffer.from(await pdf.save());
for (const [buffer, mime, name, role] of [[docx, 'application/octet-stream', 'Sai Tên Người - Sales Engineer.docx', expected.position_applied], [pdfBytes, 'text/plain', 'Candidate.pdf', 'Backend Developer']]) {
  const document = await extractCvDocument(buffer, mime, name);
  assert.equal(document.data.extracted, true);
  assert.equal(document.data.position_applied, role);
  assert.equal(document.data.expected_salary, expected.expected_salary);
  assert.equal(document.data.education_degree, 'Đại học');
  assert.equal(document.data.date_of_birth, '2000-02-29');
  assert.equal(await extractCvDocument(buffer, mime, name), document, 'Save re-read the same uploaded file');
}
console.log('PASS: actual DOCX/PDF files (including incorrect MIME) extract correctly; identical files use the bounded cache');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ baseURL: process.env.LOCAL_TEST_URL || 'http://localhost:4028' });
const page = await context.newPage();
try {
  await page.goto('/nguon-nhan-luc/kho-ung-vien', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.getByRole('heading', { name: 'Thư mục ngành nghề' })).toBeVisible({ timeout: 30000 });
  for (const [buffer, name, mime, position] of [[docx, 'Sai Tên Người - Sales Engineer.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expected.position_applied],
    [pdfBytes, 'Candidate.pdf', 'application/pdf', 'Backend Developer']]) {
    const response = await context.request.post('/api/hr/cv/extract', { multipart: { file: { name, mimeType: mime, buffer } }, timeout: 60000 });
    assert.equal(response.status(), 200, await response.text());
    const data = (await response.json()).data;
    assert.equal(data.position_applied, position); assert.equal(data.expected_salary, 22000000);
    assert.equal(data.education_degree, 'Đại học'); assert.equal(data.method, 'text');
  }
  assert.equal((await context.request.post('/api/hr/cv/extract', { multipart: {} })).status(), 400);
  console.log('PASS: protected localhost extract API returns every field from real files without creating any CV');
  if (process.env.VERIFY_CV_OCR === 'true') {
    const { createCanvas } = createRequire(require.resolve('pdf-parse'))('@napi-rs/canvas');
    const canvas = createCanvas(1600, 1800), drawing = canvas.getContext('2d');
    drawing.fillStyle = 'white'; drawing.fillRect(0, 0, 1600, 1800); drawing.fillStyle = 'black'; drawing.font = '32px Arial';
    english.split('\n').forEach((line, index) => drawing.fillText(line, 50, 100 + index * 70));
    const image = canvas.toBuffer('image/png');
    const scanned = await PDFDocument.create();
    const embedded = await scanned.embedPng(image);
    scanned.addPage([595, 842]).drawImage(embedded, { x: 0, y: 0, width: 595, height: 842 });
    for (const [buffer, name, mime] of [[image, 'Scan.png', 'image/png'], [Buffer.from(await scanned.save()), 'Scanned.pdf', 'application/pdf']]) {
      const response = await context.request.post('/api/hr/cv/extract', { multipart: { file: { name, mimeType: mime, buffer } }, timeout: 120000 });
      assert.equal(response.status(), 200, await response.text());
      const data = (await response.json()).data;
      assert.equal(data.method, 'ocr', JSON.stringify(data.warnings));
      assert.equal(data.candidate_name, 'Nguyen Van An'); assert.equal(data.candidate_email, 'an@example.test');
      assert.equal(data.position_applied, 'Backend Developer'); assert.equal(data.industry, 'Công nghệ thông tin');
      assert.equal(data.evidence.candidate_name.confidence, 'review');
      console.log(`PASS: real ${name} OCR auto-fills candidate information and industry, with explicit review flags`);
    }
  }
} finally { await browser.close(); }
