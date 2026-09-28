import { queryOne, execute, query } from '@/lib/db';
import { getSsoConfig } from '@/lib/services/systemSettingsService';

/**
 * ssoProvisioningService — đồng bộ user AssetFlow → SSO (sso.fadoai.com) qua
 * Provisioning API (M2M client_credentials, scope users:write, rate-limit 30 req/phút).
 *
 * Nguyên tắc: AssetFlow là master. Lỗi SSO KHÔNG chặn thao tác local — chỉ ghi
 * sso_sync_status='error' để retry bằng nút Đồng bộ SSO trên trang Người Dùng.
 * Email thuộc domain Zimbra (cấu hình ở Cấu Hình Hệ Thống) → skipped_zimbra:
 * user đó đăng nhập SSO bằng mật khẩu Zimbra, không cần local user bên SSO.
 */

export interface SsoSyncResult {
  status: 'synced' | 'skipped_zimbra' | 'error' | 'disabled';
  error?: string;
  ssoUserId?: string;
  /**
   * Chỉ có khi vừa TẠO user SSO mới bằng mật khẩu TỰ SINH (caller không truyền password).
   * Caller chịu trách nhiệm gửi email cho user — TUYỆT ĐỐI không log/không lưu DB.
   */
  generatedPassword?: string;
  /**
   * true = tạo bằng cách IMPORT hash bcrypt sẵn có → user giữ nguyên mật khẩu cũ,
   * KHÔNG cần gửi email thông báo. Dùng để báo cáo khi migrate.
   */
  importedHash?: boolean;
  /** true = LIÊN KẾT vào tài khoản SSO đã tồn tại (không tạo mới, không đổi mật khẩu). */
  linked?: boolean;
}

interface SsoProvisionedUser {
  id: string;
  email: string;
  authSource?: string;
  status?: string;
  name?: string;
}

// ---- env + base URL ----
function getM2mEnv(): { issuer: string; base: string; clientId: string; clientSecret: string } {
  const issuer = (process.env.SSO_ISSUER || 'https://sso.fadoai.com/oidc').replace(/\/$/, '');
  const base = issuer.replace(/\/oidc$/, ''); // provisioning nằm ngoài /oidc
  const clientId = process.env.SSO_M2M_CLIENT_ID;
  const clientSecret = process.env.SSO_M2M_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SSO_M2M_CLIENT_ID / SSO_M2M_CLIENT_SECRET chưa được cấu hình trong env');
  }
  return { issuer, base, clientId, clientSecret };
}

// ---- machine token (client_credentials) + cache ----
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getMachineToken(forceNew = false): Promise<string> {
  if (!forceNew && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const { issuer, clientId, clientSecret } = getM2mEnv();
  const res = await fetchWithTimeout(`${issuer}/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'users:write' }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SSO M2M token lỗi ${res.status}: ${body.slice(0, 200)}`);
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/**
 * Timeout cho MỌI lời gọi sang SSO. Bắt buộc: `fetch` không có timeout mặc định, nên SSO
 * treo sẽ giữ request sống vô hạn — và vì các call nối nhau qua `throttleChain`, một call
 * treo sẽ CHẶN TOÀN BỘ thao tác SSO của tiến trình (đã gặp thật: server kẹt, mọi request
 * sau đó đứng hình). 20s đủ rộng cho một call provisioning bình thường.
 */
const SSO_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SSO_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error(`SSO không phản hồi trong ${SSO_TIMEOUT_MS / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---- throttle: SSO giới hạn 30 req/phút → giãn tối thiểu 2.1s giữa các call ----
const MIN_GAP_MS = 2_100;
let throttleChain: Promise<void> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = throttleChain.then(fn);
  throttleChain = run.then(
    () => new Promise<void>((r) => setTimeout(r, MIN_GAP_MS)),
    () => new Promise<void>((r) => setTimeout(r, MIN_GAP_MS)),
  );
  return run;
}

/** Gọi Provisioning API kèm token; 401 → xin token mới + retry đúng 1 lần. */
async function ssoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { base } = getM2mEnv();
  const doFetch = async (forceToken: boolean) => {
    const token = await getMachineToken(forceToken);
    return fetchWithTimeout(`${base}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {}),
        authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
  };
  return throttled(async () => {
    let res = await doFetch(false);
    if (res.status === 401) res = await doFetch(true);
    return res;
  });
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  return `SSO ${res.status}: ${body.slice(0, 300)}`;
}

/**
 * Lỗi cho endpoint MANG MẬT KHẨU: giữ nội dung phản hồi (cần để phân loại, vd SSO từ chối
 * domain Zimbra) nhưng XOÁ mọi lần xuất hiện mật khẩu vừa gửi — một số API echo lại giá trị
 * field vi phạm ("password 'xyz' quá yếu") → tránh lọt mật khẩu vào log/DB/Telegram.
 */
async function readErrorScrubbed(res: Response, secret: string): Promise<string> {
  const body = await res.text().catch(() => '');
  const safe = secret ? body.split(secret).join('***') : body;
  return `SSO ${res.status}: ${safe.slice(0, 300)}`;
}

/**
 * Bóc lớp bao chuẩn của Provisioning API: `{error_code, message, data:{…}}`.
 * Vẫn xử lý cả dạng không bọc để không phụ thuộc phiên bản API.
 */
function unwrap<T = Record<string, unknown>>(j: unknown): T {
  const o = j as { data?: unknown };
  return (o && typeof o === 'object' && 'data' in o ? o.data : j) as T;
}

/** bcrypt chuẩn: `$2a$/$2b$/$2y$` + cost 2 chữ số + 53 ký tự salt/hash. */
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
export function isBcryptHash(v: string | null | undefined): boolean {
  return typeof v === 'string' && BCRYPT_RE.test(v);
}

// ---- API calls thô ----
/**
 * Tạo local user bên SSO.
 * - Mặc định `password` là plaintext (SSO yêu cầu ≥10 ký tự).
 * - Kèm `hashAlgorithm: 'bcrypt'` thì `password` được SSO hiểu là HASH SẴN — dùng khi
 *   migrate user cũ để họ GIỮ NGUYÊN mật khẩu đang dùng (không phải đặt lại, không cần
 *   gửi email). Lúc đó luật ≥10 ký tự không áp dụng.
 */
export async function createSsoUser(p: {
  email: string; password: string; fullName?: string; phoneNumber?: string;
  hashAlgorithm?: 'bcrypt';
}): Promise<SsoProvisionedUser> {
  if (p.hashAlgorithm === 'bcrypt' && !isBcryptHash(p.password)) {
    // Chặn sớm: gửi nhầm plaintext kèm cờ hash sẽ tạo tài khoản KHÔNG đăng nhập được.
    throw new Error('Giá trị truyền vào không phải hash bcrypt hợp lệ');
  }
  const res = await ssoFetch('/provisioning/users', {
    method: 'POST',
    body: JSON.stringify({
      email: p.email,
      password: p.password,
      fullName: p.fullName || p.email,
      ...(p.phoneNumber ? { phoneNumber: p.phoneNumber } : {}),
      ...(p.hashAlgorithm ? { hashAlgorithm: p.hashAlgorithm } : {}),
    }),
  });
  // Body có thể echo mật khẩu vừa gửi → xoá mật khẩu khỏi nội dung lỗi trước khi throw.
  if (!res.ok) throw new Error(await readErrorScrubbed(res, p.password));
  const created = unwrap<SsoProvisionedUser>(await res.json());
  if (!created?.id) {
    // Không có id thì không lưu được liên kết → lần sau sẽ tạo trùng. Coi là lỗi ngay.
    throw new Error('SSO tạo user nhưng không trả về id — kiểm tra định dạng phản hồi API');
  }
  return created;
}

export async function findSsoUserByEmail(email: string): Promise<SsoProvisionedUser | null> {
  const res = await ssoFetch(`/provisioning/users?email=${encodeURIComponent(email)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  const payload = unwrap<SsoProvisionedUser & { items?: SsoProvisionedUser[] }>(await res.json());
  // API có thể trả object đơn hoặc dạng danh sách — chấp nhận cả hai.
  const found = Array.isArray(payload?.items)
    ? payload.items.find((x) => x?.email?.trim().toLowerCase() === email.trim().toLowerCase()) ?? null
    : (payload?.id ? payload : null);

  /**
   * ⚠️ BẮT BUỘC đối chiếu email trả về với email yêu cầu.
   * Đã gặp THẬT: `GET /provisioning/users?email=X` của SSO BỎ QUA tham số email và trả về
   * một user bất kỳ. Nếu tin kết quả đó, ta sẽ LIÊN KẾT user A với tài khoản SSO của người
   * khác → A đăng nhập vào đúng tài khoản của B. Lệch email = coi như KHÔNG tìm thấy.
   */
  if (found && found.email?.trim().toLowerCase() !== email.trim().toLowerCase()) {
    console.error(
      `[sso] CẢNH BÁO: tra "${email}" nhưng API trả về "${found.email}" — bỏ qua kết quả sai này.`
    );
    return null;
  }
  return found;
}

export async function updateSsoProfile(ssoUserId: string, patch: {
  fullName?: string; displayName?: string; phoneNumber?: string;
}): Promise<void> {
  const res = await ssoFetch(`/provisioning/users/${encodeURIComponent(ssoUserId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function setSsoStatus(ssoUserId: string, status: 'active' | 'inactive'): Promise<void> {
  const res = await ssoFetch(`/provisioning/users/${encodeURIComponent(ssoUserId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

/**
 * Đặt lại mật khẩu SSO. `hashAlgorithm: 'bcrypt'` → `password` là hash sẵn (import cho
 * tài khoản đã tồn tại, vd chạy lại migration cho người bị sót).
 */
export async function resetSsoPassword(
  ssoUserId: string,
  password: string,
  hashAlgorithm?: 'bcrypt'
): Promise<void> {
  if (hashAlgorithm === 'bcrypt' && !isBcryptHash(password)) {
    throw new Error('Giá trị truyền vào không phải hash bcrypt hợp lệ');
  }
  const res = await ssoFetch(`/provisioning/users/${encodeURIComponent(ssoUserId)}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password, ...(hashAlgorithm ? { hashAlgorithm } : {}) }),
  });
  // Body có thể echo mật khẩu vừa gửi → xoá mật khẩu khỏi nội dung lỗi trước khi throw.
  if (!res.ok) throw new Error(await readErrorScrubbed(res, password));
}

// ---- helpers ----
export async function isZimbraEmail(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (!domain) return false;
  const cfg = await getSsoConfig();
  return cfg.zimbraDomains.includes(domain);
}

/** Mật khẩu ngẫu nhiên đạt yêu cầu SSO (≥10 ký tự). KHÔNG log giá trị này. */
export function generateRandomPassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

/** SSO từ chối vì email thuộc domain Zimbra (server tự biết dù ta chưa cấu hình domain). */
function isZimbraRejection(message: string): boolean {
  return /zimbra/i.test(message);
}

export async function markSsoSyncStatus(
  userId: string,
  status: 'synced' | 'error' | 'skipped_zimbra' | 'disabled',
  error?: string | null,
  ssoUserId?: string | null
): Promise<void> {
  await execute(
    `UPDATE users SET
       sso_sync_status = $2,
       sso_sync_error  = $3,
       sso_synced_at   = NOW()
       ${ssoUserId !== undefined ? ', sso_user_id = $4' : ''}
     WHERE id::text = $1`,
    ssoUserId !== undefined
      ? [userId, status, error ?? null, ssoUserId]
      : [userId, status, error ?? null]
  );
}

/** Báo super_admin khi sync lỗi (qua notification engine — event thêm ở eventCatalog). */
async function notifySyncFailed(u: { id: string; email: string; name?: string | null }, errorMessage: string): Promise<void> {
  try {
    const admins = await query<{ id: string }>(
      `SELECT id::text AS id FROM users WHERE role = 'super_admin' AND status = 'active'`
    );
    if (admins.length === 0) return;
    const { notify } = await import('@/lib/notifications/engine');
    await notify(
      'sso.sync_failed',
      { userName: u.name || u.email, userEmail: u.email, errorMessage: errorMessage.slice(0, 200) },
      { recipients: admins.map((a) => a.id), relatedId: u.id }
    );
  } catch (e) {
    console.error('[sso] notifySyncFailed error:', (e as Error).message);
  }
}

// ---- orchestrator ----
/**
 * Đồng bộ 1 user local → SSO. KHÔNG throw — mọi kết quả phản ánh qua return + cột sso_*.
 * - Zimbra domain → skipped_zimbra (không gọi SSO).
 * - Đã có sso_user_id → PATCH profile + status.
 * - Chưa có → tìm theo email để LINK, không thấy → tạo mới.
 *
 * Mật khẩu khi tạo mới, theo thứ tự ưu tiên:
 *  1. `opts.useLocalHash` + user còn bcrypt hash trong AssetFlow → IMPORT HASH: người dùng
 *     GIỮ NGUYÊN mật khẩu đang dùng, không sinh mật khẩu mới, KHÔNG cần gửi email.
 *     Dùng cho migrate user cũ (chạy một lần khi go-live).
 *  2. `opts.password` (admin nhập khi tạo user).
 *  3. Tự sinh ngẫu nhiên → trả `generatedPassword` để caller gửi email.
 */
export async function syncUserToSso(
  u: { id: string; email: string; name?: string | null; phone?: string | null; status?: string | null },
  opts: { password?: string; force?: boolean; useLocalHash?: boolean } = {}
): Promise<SsoSyncResult> {
  try {
    const cfg = await getSsoConfig();
    if (!cfg.autoSyncEnabled && !opts.force) return { status: 'disabled' };

    const email = u.email?.trim().toLowerCase();
    if (!email) {
      await markSsoSyncStatus(u.id, 'error', 'User không có email');
      return { status: 'error', error: 'User không có email' };
    }

    if (await isZimbraEmail(email)) {
      await markSsoSyncStatus(u.id, 'skipped_zimbra', null);
      return { status: 'skipped_zimbra' };
    }

    // Lấy link hiện có từ DB (nguồn sự thật, không tin object truyền vào).
    // Kèm hash local khi được yêu cầu import (chỉ đọc trong nhánh này, không log).
    const row = await queryOne<{ sso_user_id: string | null; password: string | null }>(
      `SELECT sso_user_id, ${opts.useLocalHash ? 'password' : 'NULL AS password'}
         FROM users WHERE id::text = $1`,
      [u.id]
    );
    let ssoUserId = row?.sso_user_id || null;
    let generatedPassword: string | undefined;
    let importedHash = false;
    let linkedExisting = false;
    // Vừa TẠO mới bên SSO thì hồ sơ + trạng thái đã đúng ngay từ lệnh tạo → bỏ 2 lượt gọi
    // thừa. Quan trọng khi migrate hàng loạt: SSO giới hạn 30 req/phút, 4 lượt/user xuống
    // còn 2 lượt/user là nhanh gấp đôi.
    let justCreated = false;

    if (!ssoUserId) {
      const existing = await findSsoUserByEmail(email);
      if (existing?.id) {
        ssoUserId = existing.id; // LINK tài khoản SSO sẵn có thay vì tạo trùng
        linkedExisting = true;
      } else {
        // Ưu tiên IMPORT HASH: người dùng giữ nguyên mật khẩu, không phát sinh email.
        const localHash = opts.useLocalHash && isBcryptHash(row?.password) ? row!.password! : null;
        if (!localHash && !opts.password) generatedPassword = generateRandomPassword();
        const created = await createSsoUser({
          email,
          password: localHash || opts.password || (generatedPassword as string),
          fullName: u.name || email,
          phoneNumber: u.phone || undefined,
          ...(localHash ? { hashAlgorithm: 'bcrypt' as const } : {}),
        });
        ssoUserId = created.id;
        justCreated = true;
        importedHash = !!localHash;
      }
    }

    if (!justCreated) {
      await updateSsoProfile(ssoUserId, {
        fullName: u.name || email,
        ...(u.phone ? { phoneNumber: u.phone } : {}),
      });
    }
    // User tạo mới bên SSO mặc định active → chỉ cần gọi khi cần KHOÁ, hoặc khi link tài khoản cũ.
    if (!justCreated || u.status === 'inactive') {
      await setSsoStatus(ssoUserId, u.status === 'inactive' ? 'inactive' : 'active');
    }

    await markSsoSyncStatus(u.id, 'synced', null, ssoUserId);
    return {
      status: 'synced',
      ssoUserId,
      ...(generatedPassword ? { generatedPassword } : {}),
      ...(importedHash ? { importedHash: true } : {}),
      ...(linkedExisting ? { linked: true } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isZimbraRejection(message)) {
      // SSO tự từ chối vì domain Zimbra → coi như phân loại đúng, không phải lỗi.
      await markSsoSyncStatus(u.id, 'skipped_zimbra', null).catch(() => {});
      return { status: 'skipped_zimbra' };
    }
    console.error(`[sso] sync user ${u.id} lỗi:`, message);
    await markSsoSyncStatus(u.id, 'error', message).catch(() => {});
    await notifySyncFailed(u, message);
    return { status: 'error', error: message };
  }
}

/** Đổi mật khẩu SSO cho user local (nếu đã link). SSO tự thu hồi mọi phiên của user đó. */
export async function resetSsoPasswordForUser(userId: string, newPassword: string): Promise<SsoSyncResult> {
  try {
    // Toggle tắt → không gọi SSO (giống syncUserToSso) — gọi trực tiếp hàm này (deactivateUser,
    // adminChangeUserPassword...) không được lách qua toggle autoSyncEnabled.
    const cfg = await getSsoConfig();
    if (!cfg.autoSyncEnabled) return { status: 'disabled' };

    const row = await queryOne<{ sso_user_id: string | null; email: string; name: string | null }>(
      `SELECT sso_user_id, email, name FROM users WHERE id::text = $1`, [userId]
    );
    if (!row) return { status: 'error', error: 'User không tồn tại' };
    if (!row.sso_user_id) return { status: 'error', error: 'User chưa liên kết SSO' };
    await resetSsoPassword(row.sso_user_id, newPassword);
    return { status: 'synced', ssoUserId: row.sso_user_id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sso] reset password user ${userId} lỗi:`, message);
    return { status: 'error', error: message };
  }
}

/** Khóa/mở user bên SSO (nếu đã link) — dùng cho deactivate/hard-delete. */
export async function setSsoStatusForUser(userId: string, status: 'active' | 'inactive'): Promise<SsoSyncResult> {
  try {
    // Toggle tắt → không gọi SSO (giống syncUserToSso) — gọi trực tiếp hàm này (deactivateUser...)
    // không được lách qua toggle autoSyncEnabled.
    const cfg = await getSsoConfig();
    if (!cfg.autoSyncEnabled) return { status: 'disabled' };

    const row = await queryOne<{ sso_user_id: string | null }>(
      `SELECT sso_user_id FROM users WHERE id::text = $1`, [userId]
    );
    if (!row?.sso_user_id) return { status: 'error', error: 'User chưa liên kết SSO' };
    await setSsoStatus(row.sso_user_id, status);
    return { status: 'synced', ssoUserId: row.sso_user_id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sso] set status user ${userId} lỗi:`, message);
    return { status: 'error', error: message };
  }
}
