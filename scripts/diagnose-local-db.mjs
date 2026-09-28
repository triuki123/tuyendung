import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local', quiet: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('TABLES:', tables.rows.map(r => r.table_name).join(', '));
  const user = await client.query('SELECT id, role, status FROM users WHERE id=$1', [process.env.LOCAL_DEV_BYPASS_AUTH_USER_ID || '00000000-0000-4000-8000-000000000001']);
  console.log('LOCAL USER:', JSON.stringify(user.rows));
  for (const [name, sql] of [
    ['CV metadata', 'SELECT id FROM hr_cv_pool WHERE deleted_at IS NULL ORDER BY rating DESC NULLS LAST, years_experience DESC NULLS LAST, created_at DESC LIMIT 200'],
    ['Industry folders', 'SELECT i.id, COUNT(c.id) FROM hr_cv_industries i LEFT JOIN hr_cv_pool c ON LOWER(BTRIM(c.industry))=LOWER(i.name) AND c.deleted_at IS NULL WHERE i.deleted_at IS NULL GROUP BY i.id'],
    ['Requisitions', 'SELECT id FROM requisitions WHERE deleted_at IS NULL LIMIT 200'],
  ]) {
    const start = Date.now();
    try { const result = await client.query(sql); console.log(`${name}: ${Date.now() - start}ms, ${result.rowCount} rows`); }
    catch (error) { console.log(`${name}: ${error.code}, ${error.message}`); }
  }
} catch (error) {
  console.log('DATABASE ERROR:', error.code || error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
