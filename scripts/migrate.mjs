// migrate.mjs — chay reconcile.sql idempotent truoc khi app start.
// Goi trong Dockerfile CMD: node scripts/migrate.mjs && node server.js
// An toan chay lai nhieu lan (reconcile.sql chi dung IF NOT EXISTS).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// Next.js standalone chi trace nhanh CJS cua pg (lib/index.js) vi app dung require('pg').
// File esm/index.mjs KHONG duoc copy vao image, nen import ESM truc tiep se ERR_MODULE_NOT_FOUND.
// Dung createRequire de load dung nhanh CJS giong app.
const require = createRequire(import.meta.url);
const pg = require('pg');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = join(__dirname, '..', 'docker', 'postgres', 'reconcile.sql');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[migrate] DATABASE_URL chua duoc set — bo qua reconcile.');
  process.exit(0);
}

const ssl = process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false;

async function run() {
  const sql = readFileSync(SQL_PATH, 'utf8');
  const client = new pg.Client({ connectionString, ssl });

  // DB co healthcheck (depends_on) nhung van retry nhe cho chac.
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.connect();
      break;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.warn(`[migrate] DB chua san sang (lan ${attempt}/${maxAttempts}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[migrate] reconcile.sql ap dung thanh cong.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('[migrate] LOI khi chay reconcile:', err.message);
  process.exit(1);
});
