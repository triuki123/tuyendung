import { NextResponse } from 'next/server';

/**
 * Cookie danh tính (httpOnly, ĐÃ KÝ HMAC) — nguồn sự thật DUY NHẤT cho danh tính
 * người dùng ở tầng server.
 *
 * Vì sao ký: middleware (Edge) không truy cập được DB (pg). Thay vì tin các header
 * client tự gửi (x-current-user-id/role/permissions — spoof được), middleware xác
 * minh chữ ký cookie rồi GHI ĐÈ các header đó bằng giá trị tin cậy lấy từ cookie.
 * Cookie chỉ được tạo bởi server lúc đăng nhập (sau khi bcrypt/Telegram hợp lệ),
 * client không thể tự làm giả vì không có AUTH_SECRET.
 *
 * Dùng Web Crypto (crypto.subtle) để chạy được ở cả Edge runtime lẫn Node.
 */

export const SESSION_COOKIE = 'assetflow_session';

/** 30 ngày. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Danh tính tin cậy nhúng trong cookie. */
export interface AuthIdentity {
  uid: string;           // user id
  role: string;          // vai trò ở công ty CHÍNH
  sid: string;           // session id (đối chiếu user_sessions ở tầng API khi cần)
  name?: string;         // tên hiển thị
  dept?: string;         // department_id
  perms?: unknown;       // module_permissions (JSON)
  iat: number;           // issued-at (giây)
  exp?: number;
  kind?: 'user' | 'service';
}

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    throw new Error(
      'AUTH_SECRET chưa được cấu hình — không thể ký/xác minh cookie danh tính.'
    );
  }
  return s;
}

// ---- base64url helpers (không phụ thuộc Buffer, chạy ở Edge) ----
function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

/** So sánh chuỗi theo thời gian hằng (chống timing attack). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Ký danh tính thành token `payload.signature`. */
export async function signIdentity(identity: AuthIdentity): Promise<string> {
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify(identity)));
  const sig = bytesToB64url(await hmac(payload));
  return `${payload}.${sig}`;
}

/** Xác minh token; trả về danh tính nếu chữ ký hợp lệ, ngược lại null. */
export async function verifyIdentity(token: string | undefined | null): Promise<AuthIdentity | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expected = bytesToB64url(await hmac(payload));
    if (!timingSafeEqual(sig, expected)) return null;
    const json = new TextDecoder().decode(b64urlToBytes(payload));
    const id = JSON.parse(json) as AuthIdentity;
    if (!id?.uid || !id?.sid) return null;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Number.isFinite(id.exp) ? Number(id.exp) : id.iat + MAX_AGE_SECONDS;
    if (
      !Number.isFinite(id.iat) ||
      id.iat > now + 300 ||
      now >= expiresAt
    ) {
      return null;
    }
    return id;
  } catch {
    return null;
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/**
 * Gắn cookie danh tính đã ký sau khi đăng nhập thành công.
 * `maxAgeSeconds` cho phép route đăng nhập truyền hạn theo cấu hình hệ thống (default 30 ngày).
 * KHÔNG đọc DB ở đây để file này an toàn cho middleware (Edge runtime) import.
 */
export async function setSessionCookie(
  res: NextResponse,
  identity: Omit<AuthIdentity, 'iat'>,
  maxAgeSeconds: number = MAX_AGE_SECONDS
): Promise<NextResponse> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signIdentity({
    ...identity,
    kind: 'user',
    iat: now,
    exp: now + maxAgeSeconds,
  });
  res.cookies.set(SESSION_COOKIE, token, { ...COOKIE_OPTS, maxAge: maxAgeSeconds });
  return res;
}

export async function signSessionValidationProof(
  userId: string,
  sessionId: string,
  timestamp: number
): Promise<string> {
  return bytesToB64url(await hmac(`${userId}.${sessionId}.${timestamp}`));
}

export async function verifySessionValidationProof(
  proof: string | null | undefined,
  userId: string,
  sessionId: string,
  timestamp: number
): Promise<boolean> {
  if (!proof || !Number.isFinite(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 30) return false;
  const expected = bytesToB64url(await hmac(`${userId}.${sessionId}.${timestamp}`));
  return timingSafeEqual(proof, expected);
}

/**
 * Đọc giá trị header danh tính do middleware tiêm vào (URL-encoded để chứa được
 * ký tự non-ASCII như tên tiếng Việt). Trả null nếu thiếu/giải mã hỏng.
 *
 * Dùng cho `x-current-user-name`, `x-current-user-dept`. Các header thuần ASCII
 * khác (uid/role/sid) đọc thẳng req.headers.get là đủ.
 */
export function decodeIdentityHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Xoá cookie danh tính khi đăng xuất. */
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 });
  return res;
}
