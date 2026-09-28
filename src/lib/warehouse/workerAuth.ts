import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Auth riêng cho công nhân kho (/warehouse) — tách biệt hoàn toàn với
 * session AssetFlow. Cookie ký HMAC-SHA256, payload gọn { w, h, x }.
 */

export const WAREHOUSE_COOKIE = 'warehouse_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 ngày

export interface WorkerSession {
  workerId: string;
  warehouseId: string;
}

function secret(): string {
  return (
    process.env.WAREHOUSE_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    'warehouse-dev-secret-change-me'
  );
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string): string {
  return b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
}

/** Tạo token session cho công nhân */
export function signWorkerSession(s: WorkerSession): string {
  const body = JSON.stringify({ w: s.workerId, h: s.warehouseId, x: Date.now() + MAX_AGE_SECONDS * 1000 });
  const payload = b64url(Buffer.from(body, 'utf8'));
  return `${payload}.${sign(payload)}`;
}

/** Xác minh token; trả null nếu sai/hết hạn */
export function verifyWorkerToken(token: string | undefined | null): WorkerSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const body = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (typeof body.x !== 'number' || Date.now() > body.x) return null;
    if (!body.w || !body.h) return null;
    return { workerId: String(body.w), warehouseId: String(body.h) };
  } catch {
    return null;
  }
}

/** Đọc session công nhân từ request */
export function getWorkerSession(req: NextRequest): WorkerSession | null {
  return verifyWorkerToken(req.cookies.get(WAREHOUSE_COOKIE)?.value);
}

/** Gắn cookie session công nhân vào response */
export function setWorkerCookie(res: NextResponse, s: WorkerSession): NextResponse {
  res.cookies.set(WAREHOUSE_COOKIE, signWorkerSession(s), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}

export function clearWorkerCookie(res: NextResponse): NextResponse {
  res.cookies.set(WAREHOUSE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

/** Response 401 chuẩn cho API worker */
export function workerUnauthorized(): NextResponse {
  return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
}

/** Sinh mã PIN 6 số ngẫu nhiên */
export function generatePin(): string {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * QR động dán cổng kho: token xoay theo khung 10 phút, HMAC(warehouseId|slot).
 * In tem thì in URL /warehouse?wh=CODE — trang admin hiển thị QR động realtime,
 * còn tem giấy dùng mã kho tĩnh (vẫn bắt buộc chụp ảnh khi check-in).
 */
export function qrToken(warehouseId: string, offsetSlots = 0): string {
  const slot = Math.floor(Date.now() / (10 * 60 * 1000)) + offsetSlots;
  return b64url(crypto.createHmac('sha256', secret()).update(`qr|${warehouseId}|${slot}`).digest()).slice(0, 12);
}

/** Chấp nhận token của slot hiện tại hoặc slot trước (lệch đồng hồ/quét chậm) */
export function verifyQrToken(warehouseId: string, token: string): boolean {
  return token === qrToken(warehouseId, 0) || token === qrToken(warehouseId, -1);
}

/** Khoảng cách Haversine (mét) */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
