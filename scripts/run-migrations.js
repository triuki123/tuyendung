/**
 * run-migrations.js
 * Chạy tất cả migration chưa được apply theo đúng thứ tự.
 * Dùng bảng _migrations để track — mỗi file chỉ chạy đúng 1 lần.
 *
 * Dùng: node scripts/run-migrations.js
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? true : false,
  statement_timeout: 30000,
});

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Tạo bảng tracking nếu chưa có
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Lấy danh sách đã chạy
    const { rows } = await client.query('SELECT filename FROM _migrations');
    const applied = new Set(rows.map(r => r.filename));

    // Lấy tất cả file NNN_*.sql theo đúng thứ tự (numeric sort, không string sort)
    // Ví dụ: 001, 002, ... 010, 011 (không phải 001, 010, 002, ...)
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && /^\d+/.test(f))
      .sort((a, b) => {
        // Extract leading numbers: "001_xxx" → 1, "010_yyy" → 10
        const numA = parseInt(a.match(/^(\d+)/)[1], 10);
        const numB = parseInt(b.match(/^(\d+)/)[1], 10);
        // If same number, sort alphabetically (e.g., 001_a before 001_b)
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });

    const pending = files.filter(f => !applied.has(f));

    if (pending.length === 0) {
      console.log('✅ Không có migration mới — DB đã cập nhật.');
      return;
    }

    // ── BASELINE an toàn cho DB đã có sẵn schema nhưng _migrations thiếu/rỗng ────
    // (vd DB restore từ bản dump không kèm _migrations). Nếu bảng cốt lõi `users`
    // ĐÃ tồn tại → coi các migration LEGACY là "đã áp dụng" (đánh dấu, KHÔNG chạy lại),
    // chỉ thực sự chạy migration kiến trúc mới (idempotent). Tránh runner kẹt ở
    // migration cũ không idempotent → KHÔNG chặn deploy.
    //
    // Legacy = số thứ tự <= 72 (đã deploy từ trước) HOẶC >= 900 (migration test).
    // Migration 73..899 (gồm 073-076 và mọi migration TƯƠNG LAI) luôn chạy bình thường.
    const BASELINE_THROUGH = 72;
    const migNum = (f) => { const m = f.match(/^(\d+)/); return m ? parseInt(m[1], 10) : 99999; };
    const isLegacy = (f) => { const n = migNum(f); return n <= BASELINE_THROUGH || n >= 900; };

    const core = await client.query(`SELECT to_regclass('public.users') AS t`);
    const schemaExists = core.rows[0].t != null;

    let baselinedCount = 0;
    if (schemaExists) {
      const toBaseline = pending.filter(isLegacy);
      for (const file of toBaseline) {
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
          [file]
        );
      }
      baselinedCount = toBaseline.length;
      if (baselinedCount > 0) {
        console.log(`[Migrations] BASELINE: DB đã có schema → đánh dấu ${baselinedCount} migration legacy là đã áp dụng.`);
      }
    }

    const toRun = schemaExists ? pending.filter((f) => !isLegacy(f)) : pending;
    console.log(`[Migrations] ${toRun.length} migration cần chạy thực sự:\n`);

    let appliedCount = 0;
    for (const file of toRun) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING', [file]);
        await client.query('COMMIT');
        console.log('✅', file);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ FAILED: ${file}`);
        console.error('   ', err.message, '(code', err.code + ')');
        process.exit(1);
      }
    }

    console.log(`\n🎉 Hoàn tất: ${appliedCount} migration áp dụng${baselinedCount > 0 ? `, ${baselinedCount} baseline (đã có sẵn)` : ''}.`);
  } catch (err) {
    console.error('Migration runner error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
