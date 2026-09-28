/**
 * check-no-raw-colors.js — Ratchet chặn "màu thô" mới (Phase 2 token hoá).
 *
 * Đếm các pattern màu hardcode mà bộ token thay thế (xem docs/technical/theme-token-map.md).
 * So với "trần" trong scripts/raw-colors-baseline.json:
 *   - hiện tại > trần  → exit 1 (có nợ MỚI, sửa dùng token thay vì màu thô)
 *   - hiện tại ≤ trần  → OK; nếu < trần, nhắc cập nhật trần (siết dần)
 *
 * Dùng:
 *   node scripts/check-no-raw-colors.js            # kiểm tra
 *   node scripts/check-no-raw-colors.js --update   # ghi trần = hiện tại (sau khi migrate)
 *
 * KHÔNG đụng code — chỉ đọc & đếm.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const BASELINE = path.join(__dirname, 'raw-colors-baseline.json');

// Các pattern màu thô cần thay bằng token ngữ nghĩa.
const PATTERNS = [
  { name: 'arbitrary-hex',  re: /\b(?:bg|border|divide|ring|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g },
  { name: 'white-opacity',  re: /\b(?:bg|border|divide|ring)-white\/(?:\d{1,3}|\[[0-9.]+\])/g },
  { name: 'slate-gray-text', re: /\btext-(?:slate|gray)-(?:300|400|500)\b/g },
];

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function count() {
  const files = walk(SRC);
  let total = 0;
  const byFile = {};
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    let n = 0;
    for (const { re } of PATTERNS) n += (txt.match(re) || []).length;
    if (n > 0) { byFile[path.relative(SRC, f)] = n; total += n; }
  }
  return { total, files: Object.keys(byFile).length, byFile };
}

const cur = count();
const update = process.argv.includes('--update');

if (update || !fs.existsSync(BASELINE)) {
  fs.writeFileSync(BASELINE, JSON.stringify({ total: cur.total, files: cur.files }, null, 2) + '\n');
  console.log(`✅ Ghi trần: ${cur.total} màu thô trong ${cur.files} file.`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
console.log(`Màu thô: hiện tại ${cur.total} (trần ${base.total}), trong ${cur.files} file.`);

if (cur.total > base.total) {
  console.error(`\n❌ TĂNG ${cur.total - base.total} màu thô so với trần — dùng token (bg-surface-2, border-line, text-ink-muted...) thay vì hardcode.`);
  console.error('   Xem docs/technical/theme-token-map.md.');
  process.exit(1);
}
if (cur.total < base.total) {
  console.log(`\n👍 Giảm ${base.total - cur.total} so với trần. Chạy "--update" để siết trần xuống ${cur.total}.`);
}
console.log('✅ Không có màu thô mới.');
