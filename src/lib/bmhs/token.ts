import crypto from 'crypto';

/**
 * Vé mở khóa BMHS — ngắn hạn (mặc định 60s), ký HMAC, gắn chặt (người xem + hồ sơ).
 * Dùng để 1 lần nhập mật khẩu đúng cho phép các request nối tiếp của CÙNG thao tác
 * (mở chi tiết / tải 1 file) hoàn tất. KHÔNG lưu cookie/bền — hết hạn là phải nhập lại.
 */
const TTL_MS = 60_000;

function secret(): string {
  return process.env.BMHS_TOKEN_SECRET || process.env.SESSION_SECRET || 'bmhs-dev-secret-change-me';
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string): string {
  return b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
}

/** Sinh vé cho cặp (viewerId, employeeId). */
export function issueUnlockToken(viewerId: string, employeeId: string): string {
  const body = JSON.stringify({ v: viewerId.toLowerCase(), e: employeeId.toLowerCase(), x: Date.now() + TTL_MS });
  const payload = b64url(Buffer.from(body, 'utf8'));
  return `${payload}.${sign(payload)}`;
}

/** Xác minh vé đúng cho cặp (viewerId, employeeId) và chưa hết hạn. */
export function verifyUnlockToken(token: string | null | undefined, viewerId: string, employeeId: string): boolean {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, mac] = token.split('.');
  const expected = sign(payload);
  // So sánh chống timing attack (độ dài phải khớp).
  if (mac.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (data.v !== viewerId.toLowerCase() || data.e !== employeeId.toLowerCase()) return false;
    if (typeof data.x !== 'number' || Date.now() > data.x) return false;
    return true;
  } catch {
    return false;
  }
}
