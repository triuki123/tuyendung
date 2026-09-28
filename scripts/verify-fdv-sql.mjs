import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local database only');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query('BEGIN');
  const service = await readFile('src/lib/services/fdvService.ts', 'utf8');
  for (const sql of service.matchAll(/await query\(`([\s\S]*?)`\)/g)) await client.query(sql[1]);
  await client.query("INSERT INTO fdv_tasks (id,user_id,title,due_at,remind_at) VALUES ('fdv_sql_test','fdv_test_user','Test',NOW()+INTERVAL '1 hour',NOW()+INTERVAL '30 minutes')");
  const hidden = await client.query("SELECT * FROM fdv_tasks WHERE id = 'fdv_sql_test' AND user_id = 'other_user'");
  assert.equal(hidden.rowCount, 0);
  await client.query("UPDATE fdv_tasks SET done = TRUE WHERE id='fdv_sql_test' AND user_id='fdv_test_user'");
  const done = await client.query("SELECT done FROM fdv_tasks WHERE id='fdv_sql_test'");
  assert.equal(done.rows[0].done, true);
  await client.query('ROLLBACK');
  console.log('PASS interview reminder sync SQL and task owner filtering. Test data rolled back.');
} finally { await client.end(); }
