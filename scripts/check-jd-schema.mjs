import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Local database only');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await c.connect();
  if (process.argv.includes('--repair')) {
    const migration = await readFile(new URL('../migrations/098_onboarding_system.sql', import.meta.url), 'utf8');
    const create = migration.match(/CREATE TABLE IF NOT EXISTS hr_jd_pool \([\s\S]*?\n\);/)[0];
    await c.query('BEGIN');
    const mediaMigration = await readFile(new URL('../migrations/302_create_media_table.sql', import.meta.url), 'utf8');
    const userIdType = (await c.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id'")).rows[0]?.data_type;
    if (!['text', 'uuid'].includes(userIdType)) throw new Error('Unsupported users.id type');
    await c.query(mediaMigration.slice(0, mediaMigration.indexOf('ALTER TABLE public.ticket_attachments')).replace(/uploader_id\s+UUID REFERENCES/, `uploader_id ${userIdType} REFERENCES`));
    await c.query(create);
    await c.query('ALTER TABLE hr_jd_pool ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES media(id) ON DELETE SET NULL');
    await c.query('COMMIT');
  }
  console.log((await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='hr_jd_pool'")).rows);
  await c.query('SELECT id, title, department_name, description, status, file_name, mime_type, size_bytes, created_by, created_at, updated_at FROM hr_jd_pool WHERE deleted_at IS NULL');
  console.log('PASS JD list');
  await c.query('BEGIN');
  const id = 'jd_schema_check_' + Date.now();
  await c.query("INSERT INTO hr_jd_pool (id,title,media_id) VALUES ($1,'Schema verification',NULL)", [id]);
  await c.query("UPDATE hr_jd_pool SET status='archived', deleted_at=NOW() WHERE id=$1", [id]);
  await c.query('ROLLBACK');
  console.log('PASS JD create/update/delete; test data rolled back');
} finally { await c.end(); }
