import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local database only');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query(await readFile(new URL('../migrations/106_requisition_accept_reject.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Applied requisition accept/reject schema.');
  await client.query('BEGIN');
  const row = (await client.query('SELECT id FROM requisitions LIMIT 1')).rows[0];
  if (!row) throw new Error('Schema installed; no requisition available to verify updates');
  await client.query("UPDATE requisitions SET status='open', accepted_at=NOW(), accepted_by=NULL, updated_at=NOW() WHERE id=$1", [row.id]);
  await client.query("UPDATE requisitions SET status='rejected', rejected_at=NOW(), rejected_by=NULL, reject_reason='Schema verification', updated_at=NOW() WHERE id=$1", [row.id]);
  await client.query('ROLLBACK');
  console.log('PASS: accept/reject database updates; original requisition data preserved by rollback.');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
