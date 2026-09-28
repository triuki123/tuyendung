import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { PDFDocument } from 'pdf-lib';
import { cvTestLoader } from './cv-test-loader.mjs';

dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local database only');
pg.types.setTypeParser(1082, value => value);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
let savepoint = 0;
const db = { query: async (sql, values) => (await client.query(sql, values)).rows,
  queryOne: async (sql, values) => (await client.query(sql, values)).rows[0] || null,
  execute: async (sql, values) => (await client.query(sql, values)).rowCount,
  withTransaction: async callback => {
    const name = `cv_import_${++savepoint}`;
    await client.query(`SAVEPOINT ${name}`);
    try { const result = await callback(client); await client.query(`RELEASE SAVEPOINT ${name}`); return result; }
    catch (error) { await client.query(`ROLLBACK TO SAVEPOINT ${name}`); await client.query(`RELEASE SAVEPOINT ${name}`); throw error; }
  } };
const load = cvTestLoader({ '@/lib/db': db, '@/lib/services/mediaService': { uploadBufferAsMedia: async () => null } });
const service = load('src/lib/services/hrPoolService.ts');
const prefix = `cv_import_${randomUUID().replaceAll('-', '')}`;
const pdf = await PDFDocument.create(), page = pdf.addPage([595, 842]);
const text = `Full name: Nguyen Van An\nEmail: an@example.test\nPhone: 0901234567\nDesired position: Backend Developer\nCurrent title: Software Engineer\nAddress: Ho Chi Minh City\nUniversity: University of Technology\nDegree: Bachelor of Science\nYears of experience: 3.5 years\nExpected salary: 22000000 VND\nSkills: SQL, Python\nLanguages: English\nGender: Male\nDate of birth: 2000-02-29\nEmployment type: Full time\nJob search status: Actively looking`;
`Personal information\n${text}`.split('\n').forEach((line, index) => page.drawText(line, { x: 35, y: 800 - index * 25, size: 12 }));
const buffer = Buffer.from(await pdf.save());
async function distinctBuffer(index) {
  const document = await PDFDocument.create(), page = document.addPage([595, 842]);
  `Personal information\n${text.replace('an@example.test', `${prefix}_${index}@example.test`).replace('0901234567', `091234567${index}`)}`.split('\n').forEach((line, offset) => page.drawText(line, { x: 35, y: 800 - offset * 25, size: 12 }));
  return Buffer.from(await document.save());
}
try {
  await client.connect(); await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout = '10s'");
  const created = await service.createCv({ uploadedBy: null, buffer, fileName: `${prefix}.pdf`, mimeType: 'application/pdf', industryMode: 'auto' });
  for (const [key, value] of Object.entries({ candidate_name: 'Nguyen Van An', candidate_email: 'an@example.test', candidate_phone: '0901234567',
    position_applied: 'Backend Developer', industry: 'Công nghệ thông tin', current_title: 'Software Engineer', location: 'Ho Chi Minh City',
    education_degree: 'Đại học', years_experience: 3.5, expected_salary: 22000000, gender: 'male', date_of_birth: '2000-02-29',
    employment_type: 'full_time', job_search_status: 'actively_looking', status: 'new', has_content: true })) assert.equal(created[key], value, key);
  assert.deepEqual(created.languages, ['Tiếng Anh']); assert.ok(created.skills.includes('SQL') && created.skills.includes('Python'));
  assert.ok(created.education_level.includes('University of Technology'));
  const stored = await service.getCvById(created.id);
  assert.equal(stored.expected_salary, 22000000); assert.equal(stored.education_degree, 'Đại học');
  assert.equal(stored.file_name, `${prefix}.pdf`, 'Tên tệp CV gốc phải được lưu nguyên vẹn');
  assert.ok((await service.listCvIndustries()).some(folder => folder.name === created.industry && folder.id && folder.count > 0));
  console.log('PASS: file-only import persists all 17 extracted fields, creates a real industry folder and retains New status');
  await assert.rejects(service.createCv({ uploadedBy: null, buffer, fileName: 'renamed.pdf', mimeType: 'application/pdf' }), service.DuplicateCvError);
  await assert.rejects(service.createCv({ uploadedBy: null, candidateName: 'Same email', candidateEmail: 'AN@EXAMPLE.TEST' }), service.DuplicateCvError);
  await assert.rejects(service.createCv({ uploadedBy: null, candidateName: 'Same phone', candidatePhone: '+84 901 234 567' }), service.DuplicateCvError);
  console.log('PASS: identical renamed file, duplicate email and international phone are rejected before insert');
  const manual = await service.createCv({ uploadedBy: null, buffer: await distinctBuffer(1), fileName: `${prefix}.pdf`, mimeType: 'application/pdf',
    candidateName: 'Tên do TA xác nhận', positionApplied: 'Sales Engineer', industry: prefix, industryMode: 'manual',
    candidatePhone: '', educationDegree: null, dateOfBirth: null, skills: [], yearsExperience: 0,
    manualFields: ['candidate_phone', 'education_degree', 'date_of_birth', 'skills', 'years_experience', 'industry'] });
  assert.equal(manual.candidate_name, 'Tên do TA xác nhận'); assert.equal(manual.industry, prefix);
  assert.equal(manual.candidate_phone, null); assert.equal(manual.education_degree, null); assert.equal(manual.date_of_birth, null);
  assert.equal(manual.years_experience, 0); assert.deepEqual(manual.skills, []);
  const changedRole = await service.createCv({ uploadedBy: null, buffer: await distinctBuffer(2), fileName: `${prefix}.pdf`, mimeType: 'application/pdf',
    positionApplied: 'Sales Engineer', industryMode: 'auto' });
  assert.equal(changedRole.industry, 'Kinh doanh - Bán hàng');
  const ambiguous = await service.createCv({ uploadedBy: null, buffer: await distinctBuffer(3), fileName: `${prefix}.pdf`, mimeType: 'application/pdf',
    positionApplied: 'Assistant', industryMode: 'auto' });
  assert.equal(ambiguous.industry, null);
  console.log('PASS: manual edits/cleared values/zero experience are protected; role changes reclassify; ambiguous roles stay unclassified');
  const failedFolder = `${prefix}_rollback`;
  await assert.rejects(service.createCv({ uploadedBy: null, candidateName: 'Rollback candidate', industry: failedFolder,
    gender: 'invalid', manualFields: ['gender'] }));
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM hr_cv_industries WHERE name = $1', [failedFolder])).rows[0].count, 0);
  console.log('PASS: folder and CV writes are atomic; a failed candidate insert leaves no orphan folder');
} finally {
  await client.query('ROLLBACK').catch(() => {}); await client.end();
  console.log('Transaction rolled back; no candidate, CV file or industry test data retained.');
}
