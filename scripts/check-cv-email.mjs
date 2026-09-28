import dotenv from 'dotenv';
import pg from 'pg';
import { cvTestLoader } from './cv-test-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local only');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await c.connect();
  const rows = (await c.query("SELECT id,candidate_email,content_text,file_name FROM hr_cv_pool WHERE candidate_name = 'Vũ Ngọc Minh' AND deleted_at IS NULL")).rows;
  const { extractCandidateFields } = cvTestLoader()('src/lib/services/cvExtract.ts');
  for (const row of rows) {
    const detected = extractCandidateFields(row.content_text || '', row.file_name).candidate_email;
    if (detected !== 'ngocminh260896@gmail.com') throw new Error('Email does not match verified CV');
    if (process.argv.includes('--repair')) await c.query("UPDATE hr_cv_pool SET candidate_email=$1, updated_at=NOW() WHERE id=$2 AND (candidate_email IS NULL OR candidate_email='')", [detected,row.id]);
    console.log('PASS: candidate email distinguished from references; verified repair', process.argv.includes('--repair'));
  }
} finally { await c.end(); }
