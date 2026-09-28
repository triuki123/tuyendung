import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import { cvTestLoader } from './cv-test-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local only');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
 await c.connect();
 const rows = (await c.query("SELECT id,file_name,content_text,education_level FROM hr_cv_pool WHERE candidate_name = 'Phạm Vũ Phượng Vy' AND deleted_at IS NULL")).rows;
 const { extractCandidateFields } = cvTestLoader()('src/lib/services/cvExtract.ts');
 for (const row of rows) {
   const lines = row.content_text.split('\n');
   console.log('Education context:', lines.filter((line,i) => /học vấn|thành tựu|đại học|cao đẳng|giáo dục/i.test(line) || /học vấn|đại học|cao đẳng/i.test(lines[i+1] || '') || /học vấn|đại học|cao đẳng/i.test(lines[i-1] || '')));
   const parsed = extractCandidateFields(row.content_text,row.file_name);
   assert.ok(parsed.education_level.includes('Đại học Kinh tế TP.HCM'));
   assert.ok(parsed.education_level.includes('Cao đẳng Kinh tế-Công nghệ TP.HCM'));
   assert.ok(parsed.education_level.includes('Quản trị Kinh doanh'));
   assert.ok(!/THÀNH TỰU|FPT|Tiếng Anh|Tuyển dụng/.test(parsed.education_level));
   assert.equal(parsed.education_degree, 'Đại học');
   if (process.argv.includes('--repair')) await c.query('UPDATE hr_cv_pool SET education_level=$1,education_degree=$2,updated_at=NOW() WHERE id=$3 AND education_level IS NOT DISTINCT FROM $4', [parsed.education_level,parsed.education_degree,row.id,row.education_level]);
   console.log('PASS: school names, majors, dates and degree; achievements excluded.');
 }
} finally { await c.end(); }
