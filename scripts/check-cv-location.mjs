import dotenv from 'dotenv';
import pg from 'pg';
import { cvTestLoader } from './cv-test-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local database only');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const { extractCandidateFields, normalizeSearch } = cvTestLoader()('src/lib/services/cvExtract.ts');
try {
  await client.connect();
  const rows = (await client.query('SELECT id,location,file_name,content_text FROM hr_cv_pool WHERE deleted_at IS NULL AND (candidate_name=$1 OR LOWER(BTRIM(location)) IN ($2,$3,$4,$5))', ['Bùi Gia Khánh', 'city', 'district', 'province', 'ward'])).rows;
  for (const row of rows) {
    const parsed = extractCandidateFields(row.content_text || '', row.file_name);
    console.log(JSON.stringify({ id: row.id, current: row.location, proposed: parsed.location, context: row.content_text?.split('\n').slice(0, 18) }));
    if (process.argv.includes('--repair') && parsed.location && /^(city|district|province|ward)$/i.test(row.location?.trim() || '')) {
      await client.query('UPDATE hr_cv_pool SET location=$1,updated_at=NOW() WHERE id=$2 AND location IS NOT DISTINCT FROM $3', [parsed.location, row.id, row.location]);
      // Rebuild the index from all searchable columns, not just the repaired address.
      const data = (await client.query('SELECT * FROM hr_cv_pool WHERE id=$1', [row.id])).rows[0];
      const searchable = [data.candidate_name,data.candidate_email,data.candidate_phone,data.position_applied,data.industry,data.current_title,data.education_level,data.location,...(data.skills || []),...(data.languages || []),...(data.tags || []),data.note,data.content_text].filter(Boolean).join(' ');
      await client.query('UPDATE hr_cv_pool SET search_text=$1 WHERE id=$2', [normalizeSearch(searchable), row.id]);
      console.log('Repaired incomplete generic location.');
    }
  }
} finally { await client.end(); }
