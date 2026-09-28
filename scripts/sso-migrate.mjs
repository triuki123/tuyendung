/**
 * sso-migrate.mjs — Tạo tài khoản SSO cho user AssetFlow hiện có (chạy MỘT LẦN khi go-live).
 *
 * Bối cảnh: prod đã có sẵn user. Người dùng email thuộc domain ZIMBRA không cần tạo gì
 * (SSO liên thông thẳng với Zimbra, họ đăng nhập bằng mật khẩu Zimbra). Chỉ người dùng
 * email NGOÀI mới cần tạo tài khoản trên SSO + nhận email mật khẩu ban đầu.
 *
 * Script KHÔNG tự cài logic đồng bộ — nó gọi lại đúng API đã có
 * (POST /api/users/:id/sso-sync) nên dùng chung một đường code với nút trên UI.
 * Gọi theo TỪNG NGƯỜI (không phải API bulk) để kiểm soát chính xác ai được tạo và
 * ghi log kết quả từng người, phục vụ đối chiếu sau này.
 *
 * AN TOÀN: chạy thật sẽ TẠO TÀI KHOẢN THẬT và GỬI EMAIL THẬT. Vì máy dev có thể đang
 * cắm vào bản sao dữ liệu production, script mặc định CHỈ XEM TRƯỚC; phải có cờ --yes
 * mới thực sự gọi SSO.
 *
 * Cách dùng:
 *   node scripts/sso-migrate.mjs --list                    # xem ai sẽ được tạo
 *   node scripts/sso-migrate.mjs --list --include-suspect  # xem cả nhóm email nghi vấn
 *   node scripts/sso-migrate.mjs --email=<sa> --password=<pw> --yes
 *
 * Tham số (hoặc biến môi trường tương ứng):
 *   --list                   in danh sách đích rồi dừng (không gọi SSO)
 *   --yes                    XÁC NHẬN chạy thật (thiếu cờ này thì chỉ xem trước)
 *   --emails=a@x.com,b@y.com chỉ xử lý đúng các email này (ưu tiên cao nhất, bỏ mọi bộ lọc)
 *   --include-suspect        KHÔNG loại nhóm email nghi vấn (xem --suspect-pattern)
 *   --suspect-pattern=<re>   mẫu email nghi vấn, mặc định '^[a-z]+123@'
 *                            (dữ liệu thật có loạt 'tên123@gmail.com' do HR điền tạm)
 *   --zimbra-domains=a,b     ghi đè danh sách domain Zimbra thay vì đọc cấu hình DB
 *   --url=<base>             mặc định http://localhost:4028 (SSO_MIGRATE_URL)
 *   --email=<email>          tài khoản super_admin để đăng nhập (SSO_MIGRATE_EMAIL)
 *   --password=<pass>        mật khẩu break-glass của tài khoản đó (SSO_MIGRATE_PASSWORD)
 *
 * Chạy trên server:
 *   docker exec -it <container> node scripts/sso-migrate.mjs --list
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');

// ── tham số ──────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.length ? rest.join('=') : true];
  })
);

const LIST_ONLY = !!args.list;
const CONFIRMED = !!args.yes;
/**
 * --no-email: TUYỆT ĐỐI không gửi email nào. Thực hiện bằng cách chỉ xử lý người CÓ hash
 * bcrypt để import (họ giữ nguyên mật khẩu, không cần thông báo). Người không có hash bị
 * BỎ QUA — vì tạo cho họ mà không gửi mật khẩu thì tài khoản vô dụng (mật khẩu ngẫu nhiên
 * không ai biết), tệ hơn là chưa tạo.
 */
const NO_EMAIL = !!args['no-email'];
const INCLUDE_SUSPECT = !!args['include-suspect'];
const SUSPECT_PATTERN = typeof args['suspect-pattern'] === 'string' ? args['suspect-pattern'] : '^[a-z]+123@';
const ONLY_EMAILS = typeof args.emails === 'string'
  ? args.emails.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  : null;
const ZIMBRA_OVERRIDE = typeof args['zimbra-domains'] === 'string'
  ? args['zimbra-domains'].split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
  : null;
const BASE_URL = (args.url || process.env.SSO_MIGRATE_URL || 'http://localhost:4028').replace(/\/$/, '');
const EMAIL = args.email || process.env.SSO_MIGRATE_EMAIL;
const PASSWORD = args.password || process.env.SSO_MIGRATE_PASSWORD;

const log = (...m) => console.log(...m);
const pad = (s, n) => String(s ?? '').padEnd(n);

function db() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL chưa được set.');
  return new pg.Client({
    connectionString,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

// ── chọn đối tượng: NGUỒN SỰ THẬT DUY NHẤT cho "ai sẽ được tạo" ───────────────
async function selectTargets(client) {
  let zimbraDomains = ZIMBRA_OVERRIDE;
  let source = 'tham số --zimbra-domains';
  if (!zimbraDomains) {
    const cfg = await client.query(`SELECT value FROM system_settings WHERE key = 'sso.provisioning'`);
    zimbraDomains = (cfg.rows[0]?.value?.zimbraDomains ?? []).map((d) => String(d).toLowerCase());
    source = 'Cấu Hình Hệ Thống';
  }

  // --emails: danh sách tường minh do người vận hành duyệt → bỏ qua mọi bộ lọc khác.
  if (ONLY_EMAILS) {
    const rows = (await client.query(
      `SELECT id::text AS id, email, TRIM(name) AS name, COALESCE(sso_sync_status,'') AS st,
              (password ~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$') AS co_hash
         FROM users
        WHERE status='active' AND LOWER(TRIM(email)) = ANY($1::text[])
        ORDER BY email`,
      [ONLY_EMAILS]
    )).rows;
    const found = rows.map((r) => r.email.toLowerCase());
    const missing = ONLY_EMAILS.filter((e) => !found.includes(e));
    return { rows, zimbraDomains, source, mode: 'danh sách tường minh (--emails)', missing };
  }

  const params = [];
  const conds = [
    `status = 'active'`,
    `email IS NOT NULL AND email <> ''`,
    // Chỉ người CHƯA đồng bộ hoặc từng lỗi → chạy lại script an toàn, không tạo trùng.
    `(sso_sync_status IS NULL OR sso_sync_status = 'error')`,
  ];
  if (zimbraDomains.length) {
    params.push(zimbraDomains);
    conds.push(`LOWER(TRIM(SPLIT_PART(email,'@',2))) <> ALL($${params.length}::text[])`);
  }
  if (!INCLUDE_SUSPECT) {
    params.push(SUSPECT_PATTERN);
    conds.push(`email !~* $${params.length}`);
  }

  const rows = (await client.query(
    `SELECT id::text AS id, email, TRIM(name) AS name, COALESCE(sso_sync_status,'') AS st,
            -- KHÔNG lấy hash ra ngoài, chỉ cần biết CÓ hash bcrypt hợp lệ hay không.
            (password ~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$') AS co_hash
       FROM users WHERE ${conds.join(' AND ')}
      ORDER BY LOWER(SPLIT_PART(email,'@',2)), email`,
    params
  )).rows;

  return {
    rows,
    zimbraDomains,
    source,
    mode: INCLUDE_SUSPECT ? 'tất cả user email ngoài' : `user email ngoài, LOẠI mẫu nghi vấn /${SUSPECT_PATTERN}/`,
    missing: [],
  };
}

// ── báo cáo tổng quan ────────────────────────────────────────────────────────
async function survey(client, sel) {
  const all = (await client.query(
    `SELECT LOWER(TRIM(SPLIT_PART(email,'@',2))) AS domain, COUNT(*)::int AS n
       FROM users WHERE status='active' AND email IS NOT NULL AND email <> ''
      GROUP BY 1 ORDER BY 2 DESC`
  )).rows;

  log(`\n📋 Domain Zimbra (nguồn: ${sel.source}):`,
    sel.zimbraDomains.length ? sel.zimbraDomains.join(', ') : '⚠️  CHƯA KHAI — mọi user sẽ bị coi là cần tạo!');
  log(`🔎 Tiêu chí chọn: ${sel.mode}`);

  log('\n📊 Người dùng đang hoạt động, theo domain:');
  all.forEach((r) => {
    const z = sel.zimbraDomains.includes(r.domain) ? '  (Zimbra — không cần tạo)' : '';
    log(`   ${pad(r.domain, 30)} ${String(r.n).padStart(5)}${z}`);
  });

  if (sel.missing.length) {
    log(`\n⚠️  Không tìm thấy trong DB (hoặc đã nghỉ việc): ${sel.missing.join(', ')}`);
  }

  const withHash = sel.rows.filter((u) => u.co_hash).length;
  const noHash = sel.rows.length - withHash;
  if (NO_EMAIL && noHash > 0) {
    log(`\n🚫 --no-email: BỎ QUA ${noHash} người không có hash bcrypt (tạo mà không gửi mật khẩu`);
    log('   thì tài khoản vô dụng). Xử lý riêng nhóm này sau:');
    sel.rows.filter((u) => !u.co_hash).forEach((u) => log(`     - ${pad(u.email, 34)} ${u.name || ''}`));
  }

  log(`\n🎯 SẼ TẠO ${sel.rows.length} TÀI KHOẢN TRÊN SSO:`);
  sel.rows.forEach((u, i) => {
    const how = u.co_hash
      ? '🔐 giữ nguyên mật khẩu (import hash)'
      : '📧 mật khẩu mới + GỬI EMAIL';
    const retry = u.st === 'error' ? ' (thử lại)' : '';
    log(`   ${String(i + 1).padStart(3)}. ${pad(u.email, 32)} ${pad(u.name, 22)} ${how}${retry}`);
  });
  log(`\n   🔐 Giữ nguyên mật khẩu, KHÔNG gửi email : ${withHash}`);
  log(`   📧 Sinh mật khẩu mới + gửi email        : ${noHash}`);

  // ~2 lượt gọi SSO/user (tìm + tạo), throttle 2.1s.
  log(`\n⏱️  Ước tính: ~${Math.max(1, Math.ceil((sel.rows.length * 4.2) / 60))} phút (SSO giới hạn 30 req/phút)`);
}

// ── đăng nhập lấy cookie phiên ───────────────────────────────────────────────
async function login() {
  if (!EMAIL || !PASSWORD) throw new Error('Thiếu --email/--password (tài khoản super_admin).');
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Đăng nhập thất bại (${res.status}): ${body?.error || ''}`);
  if (body?.twofa_required) throw new Error('Tài khoản bật 2FA — dùng tài khoản super_admin khác.');
  if (body?.role !== 'super_admin') throw new Error(`Cần super_admin (đang là ${body?.role}).`);
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Không nhận được cookie phiên.');
  return cookie;
}

// ── chạy thật: gọi endpoint per-user cho từng người ──────────────────────────
async function migrate(sel) {
  const cookie = await login();
  log(`\n🚀 Bắt đầu (${BASE_URL}) — ${sel.rows.length} người\n`);

  const startedAt = Date.now();
  const done = [], failed = [], skipped = [], imported = [], linked = [], emailedList = [];

  for (let i = 0; i < sel.rows.length; i++) {
    const u = sel.rows[i];
    const n = `${String(i + 1).padStart(3)}/${sel.rows.length}`;
    try {
      const res = await fetch(`${BASE_URL}/api/users/${u.id}/sso-sync`, { method: 'POST', headers: { cookie } });
      const j = await res.json().catch(() => ({}));
      const st = j?.result?.status;
      if (!res.ok) { failed.push({ email: u.email, error: j?.error || `HTTP ${res.status}` }); log(`   ${n} ❌ ${pad(u.email, 34)} ${j?.error || res.status}`); }
      else if (st === 'synced') {
        done.push(u.email);
        // 3 khả năng: import hash / liên kết tài khoản SSO đã có / tạo mới + gửi email.
        // KHÔNG suy "đã gửi email" từ việc thiếu importedHash — liên kết cũng không gửi gì.
        if (j.result.importedHash) { imported.push(u.email); log(`   ${n} ✅ ${pad(u.email, 32)} 🔐 giữ nguyên mật khẩu (import hash)`); }
        else if (j.result.linked) { linked.push(u.email); log(`   ${n} ✅ ${pad(u.email, 32)} 🔗 liên kết tài khoản SSO đã có`); }
        else { emailedList.push(u.email); log(`   ${n} ✅ ${pad(u.email, 32)} 📧 tạo mới + đã gửi email mật khẩu`); }
      }
      else if (st === 'skipped_zimbra') { skipped.push(u.email); log(`   ${n} ⏭️  ${pad(u.email, 34)} Zimbra — bỏ qua`); }
      else { failed.push({ email: u.email, error: j?.result?.error || st || 'không rõ' }); log(`   ${n} ❌ ${pad(u.email, 34)} ${j?.result?.error || st}`); }
    } catch (e) {
      failed.push({ email: u.email, error: e.message });
      log(`   ${n} ❌ ${pad(u.email, 34)} ${e.message}`);
    }
  }

  const emailed = emailedList.length;
  log('\n══════════ TỔNG KẾT ══════════');
  log(`   Đã tạo trên SSO                        : ${done.length}`);
  log(`     🔐 giữ nguyên mật khẩu (import hash) : ${imported.length}`);
  log(`     🔗 liên kết tài khoản SSO đã có       : ${linked.length}`);
  log(`     📧 mật khẩu mới + gửi email          : ${emailed}`);
  log(`   Bỏ qua (Zimbra)                        : ${skipped.length}`);
  log(`   Lỗi                                    : ${failed.length}`);
  log(`   Thời gian                              : ${Math.round((Date.now() - startedAt) / 1000)}s`);
  if (failed.length) {
    log('\n   Chi tiết lỗi:');
    failed.forEach((f) => log(`     - ${pad(f.email, 34)} ${f.error}`));
    log('\n   Chạy lại script để thử lại (chỉ nhặt người chưa xong).');
  }
  if (imported.length) {
    log(`\n   ✅ ${imported.length} người GIỮ NGUYÊN mật khẩu đang dùng — không cần thông báo gì.`);
  }
  if (emailed > 0) {
    log(`\n   ⚠️  ${emailed} người được đặt mật khẩu MỚI và gửi qua email.`);
    log('      Nếu SES lỗi thì email không tới nơi mà trạng thái vẫn synced — hãy hỏi lại họ.');
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  log('═══ Tạo tài khoản SSO cho user AssetFlow (chạy một lần khi go-live) ═══');
  const client = db();
  await client.connect();
  let sel;
  try {
    sel = await selectTargets(client);
    await survey(client, sel);
    // --no-email: chỉ giữ người import được hash → đảm bảo KHÔNG email nào được gửi.
    if (NO_EMAIL) sel.rows = sel.rows.filter((u) => u.co_hash);
  } finally {
    await client.end();
  }

  if (sel.rows.length === 0) { log('\n✅ Không có ai cần tạo. Xong.'); return; }
  if (LIST_ONLY) { log('\n✅ Chế độ --list: chỉ xem, không gọi SSO.'); return; }

  if (!CONFIRMED) {
    log('\n🛑 DỪNG — chưa có cờ --yes.');
    log(`   Chạy thật sẽ TẠO ${sel.rows.length} tài khoản trên SSO và GỬI EMAIL THẬT tới từng người.`);
    log(`   DB đang trỏ tới: ${(process.env.DATABASE_URL || '').replace(/:\/\/[^@]*@/, '://***@')}`);
    log('   Đồng ý: thêm --yes');
    return;
  }
  await migrate(sel);
})().catch((e) => {
  console.error('\n❌ LỖI:', e.message);
  process.exit(1);
});
