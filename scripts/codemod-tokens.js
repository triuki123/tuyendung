/**
 * codemod-tokens.js — Phase 3: thay màu thô → token ngữ nghĩa.
 *
 * CHỈ map các pattern có giá trị DARK TRÙNG KHÍT TUYỆT ĐỐI với token
 * (xem docs/technical/theme-token-map.md) ⇒ dark không xê dịch; gate Phase 0 xác nhận.
 * Các ca lệch giá trị (slate-300, gray-*) hoặc nhập nhằng (text-white) KHÔNG đụng tới.
 *
 * Dùng:
 *   node scripts/codemod-tokens.js "src/app/settings/**"        # dry-run (xem trước)
 *   node scripts/codemod-tokens.js "src/app/settings/**" --write # ghi file
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// [regex, thay thế] — mỗi dòng đã kiểm: dark token = đúng class cũ.
const RULES = [
  [/\bbg-\[#162033\]/g,                 'bg-surface-2'],       // #162033
  [/\bbg-white\/5(?![0-9])/g,           'bg-hover'],           // rgba(255,255,255,.05)
  [/\bborder-white\/5(?![0-9])/g,       'border-line-subtle'], // rgba(255,255,255,.05)
  [/\bborder-white\/10(?![0-9])/g,      'border-line'],        // rgba(255,255,255,.10)
  [/\bborder-white\/20(?![0-9])/g,      'border-line-strong'], // rgba(255,255,255,.20)
  [/\bdivide-white\/5(?![0-9])/g,       'divide-line-subtle'], // rgba(255,255,255,.05)
  [/\bbg-white\/10(?![0-9])/g,          'bg-hover-strong'],    // rgba(255,255,255,.10)
  [/\btext-slate-400\b/g,               'text-ink-muted'],     // #94a3b8
  [/\btext-slate-500\b/g,               'text-ink-faint'],     // #64748b
  [/\btext-slate-300\b/g,               'text-ink-bright'],    // #cbd5e1
];

const write = process.argv.includes('--write');
const globArg = process.argv.find((a) => !a.startsWith('-') && a.endsWith('**') || (a.includes('/') && !a.startsWith('-')));
if (!globArg) { console.error('Thiếu glob, vd: "src/app/settings/**"'); process.exit(1); }

// Glob đơn giản: tiền tố thư mục trước "**"
const base = path.join(ROOT, globArg.replace(/\*+.*$/, ''));

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const stat = fs.statSync(dir);
  if (stat.isFile()) { if (/\.(tsx?|jsx?)$/.test(dir)) acc.push(dir); return acc; }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

let totalEdits = 0, touched = 0;
for (const f of walk(base)) {
  const src = fs.readFileSync(f, 'utf8');
  let out = src, n = 0;
  for (const [re, rep] of RULES) out = out.replace(re, (m) => { n++; return rep; });
  if (n > 0) {
    touched++; totalEdits += n;
    console.log(`${write ? '✏️ ' : '· '}${path.relative(ROOT, f)} — ${n} thay`);
    if (write) fs.writeFileSync(f, out);
  }
}
console.log(`\n${write ? 'Đã ghi' : 'Dry-run'}: ${totalEdits} thay đổi trong ${touched} file.`);
if (!write) console.log('Thêm --write để áp dụng.');
