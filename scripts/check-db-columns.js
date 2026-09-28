/**
 * check-db-columns.js
 * Kiểm tra các cột được dùng trong service files có tồn tại trong DB không.
 * Chạy: node scripts/check-db-columns.js
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || undefined });

// Lấy tất cả cột thực tế từ DB (chỉ schema public)
async function getDbColumns() {
  const res = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const map = {};
  for (const row of res.rows) {
    if (!map[row.table_name]) map[row.table_name] = new Set();
    map[row.table_name].add(row.column_name);
  }
  return map;
}

// Quét các service files tìm pattern: u.column_name hoặc SELECT col FROM table
function scanServiceFiles() {
  const servicesDir = path.join(__dirname, '../src/lib/services');
  const suspects = []; // { file, table, column }

  // Mapping alias → table name thường gặp
  const aliasMap = {
    u: 'users',
    s: 'attendance_sheets',
    r: 'attendance_records',
    t: 'tasks',
    p: 'projects',
    c: 'companies',
    d: 'departments',
  };

  const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.ts'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(servicesDir, file), 'utf8');
    // Tìm pattern alias.column_name trong SQL strings
    const matches = content.matchAll(/\b([a-z])\.([a-z_][a-z0-9_]*)\b/g);
    for (const m of matches) {
      const [, alias, col] = m;
      const table = aliasMap[alias];
      if (table && col.length > 1 && !['id', 'in', 'is', 'or', 'on', 'as', 'by', 'to'].includes(col)) {
        suspects.push({ file, table, column: col });
      }
    }
  }
  return suspects;
}

async function main() {
  const dbCols = await getDbColumns();
  const suspects = scanServiceFiles();

  const missing = [];
  const seen = new Set();

  for (const { file, table, column } of suspects) {
    const key = `${table}.${column}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const tableCols = dbCols[table];
    if (!tableCols) continue; // table không tồn tại → bỏ qua (có thể alias sai)
    if (!tableCols.has(column)) {
      missing.push({ file, table, column });
    }
  }

  if (missing.length === 0) {
    console.log('✅ Tất cả cột đều tồn tại trong DB.');
  } else {
    console.log(`❌ Tìm thấy ${missing.length} cột có thể CHƯA TỒN TẠI trong DB:\n`);
    const byTable = {};
    for (const { file, table, column } of missing) {
      const k = `${table} (${file})`;
      if (!byTable[k]) byTable[k] = [];
      byTable[k].push(column);
    }
    for (const [k, cols] of Object.entries(byTable)) {
      console.log(`  📋 ${k}`);
      console.log(`     Cột: ${[...new Set(cols)].join(', ')}`);
    }
    console.log('\n⚠️  Tạo migration cho các cột trên trước khi deploy!');
  }

  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
