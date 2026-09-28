import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });
const required = ['telegram_chat_id', 'telegram_enabled', 'telegram_id', 'telegram_username', 'telegram_first_name', 'telegram_last_name', 'telegram_photo_url', 'telegram_linked_at'];

/** Read-only startup check; repairs require explicit local --repair. */
export async function checkTelegramSchema({ repair = false } = {}) {
  if (repair && (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) {
    throw new Error('Repair only allowed for an explicitly configured local database.');
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const rows = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'`);
    const columns = new Set(rows.rows.map(r => r.column_name));
    const missing = required.filter(c => !columns.has(c));
    if (missing.length && !repair) throw new Error(`Telegram schema thiếu: ${missing.join(', ')}. Chạy node scripts/check-telegram-schema.mjs --repair trên DB local hoặc áp dụng migration 304 khi triển khai.`);
    if (repair) {
      console.log('Missing Telegram columns:', missing.join(', ') || 'none');
      await client.query('BEGIN');
      await client.query(await readFile(new URL('../migrations/304_repair_telegram_user_schema.sql', import.meta.url), 'utf8'));
      await client.query('COMMIT');
    }
    await client.query(`SELECT ${required.join(', ')} FROM public.users LIMIT 0`);
    // Verify the exact queries used by notification recipient lookup/engine.
    await client.query(`SELECT id::text, telegram_chat_id, telegram_enabled FROM public.users WHERE id::text = ANY($1::text[])`, [[]]);
    console.log('PASS Telegram user schema and notification recipient queries.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/check-telegram-schema.mjs')) {
  checkTelegramSchema({ repair: process.argv.includes('--repair') }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
