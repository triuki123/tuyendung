import dotenv from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'node:fs';

dotenv.config({ path: '.env.local', quiet: true });
const database = new URL(process.env.DATABASE_URL);
// This helper is deliberately scoped to the local recruitment database.
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) throw new Error('This helper only migrates localhost databases');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query(readFileSync(new URL('../migrations/322_cv_filter_criteria.sql', import.meta.url), 'utf8'));
  await client.query(readFileSync(new URL('../migrations/323_cv_education_degree.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('CV filter schema ready; existing candidate information preserved.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
