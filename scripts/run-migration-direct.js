/**
 * run-migration-direct.js — Chạy MỘT/nhiều migration cụ thể, AN TOÀN cho production.
 *
 * Vì runner mặc định (run-migrations.js) đang kẹt ở migration 098 (lỗi pre-existing),
 * script này chạy thẳng các file migration được chỉ định, mỗi file trong 1 transaction,
 * và đánh dấu vào bảng _migrations (bỏ qua file đã áp dụng → chạy lại không sao).
 *
 * Cách dùng:
 *   node scripts/run-migration-direct.js                       # mặc định: 134
 *   node scripts/run-migration-direct.js 134_upgrade_cv_pool_to_ats.sql
 *   node scripts/run-migration-direct.js 131_*.sql 132_*.sql 133_*.sql 134_*.sql
 *   (truyền đúng TÊN FILE trong thư mục migrations/)
 *
 * Yêu cầu env: DATABASE_URL (hoặc PG* tiêu chuẩn), PGSSL=true nếu cần SSL.
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DEFAULT_FILES = ['134_upgrade_cv_pool_to_ats.sql'];
const migrationsDir = path.join(__dirname, '..', 'migrations');

// Cho phép glob đơn giản kiểu "131_*.sql"
function resolveArg(arg) {
  if (arg.includes('*')) {
    const re = new RegExp('^' + arg.replace(/[.+]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return fs.readdirSync(migrationsDir).filter((f) => re.test(f)).sort();
  }
  return [arg];
}

const args = process.argv.slice(2);
const files = (args.length ? args.flatMap(resolveArg) : DEFAULT_FILES);

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  console.error('❌ Thiếu DATABASE_URL (hoặc PGHOST/PGUSER...). Kiểm tra .env trên server.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  statement_timeout: 60000,
});

(async () => {
  const client = await pool.connect();
  let applied = 0, skipped = 0;
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Không tìm thấy file: ${file}`);
        process.exit(1);
      }
      const already = await client.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
      if (already.rowCount > 0) {
        console.log(`⏭️  Bỏ qua (đã áp dụng): ${file}`);
        skipped++;
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf-8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [file]);
        await client.query('COMMIT');
        console.log(`✅ Áp dụng: ${file}`);
        applied++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ LỖI ở ${file}: ${err.message} (code ${err.code})`);
        if (err.code === '42704' && /pg_trgm|unaccent/i.test(err.message)) {
          console.error('   → Extension chưa cài. Chạy bằng superuser: CREATE EXTENSION IF NOT EXISTS pg_trgm;');
        }
        process.exit(1);
      }
    }
    console.log(`\n🎉 Hoàn tất: ${applied} áp dụng, ${skipped} bỏ qua.`);
  } catch (err) {
    console.error('Lỗi runner:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
