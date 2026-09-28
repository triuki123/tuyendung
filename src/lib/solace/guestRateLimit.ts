/**
 * Rate-limit đơn giản (in-memory) cho cổng khách vãng lai — chống spam tạo đơn public.
 * Single Node server (có scheduler) nên in-memory đủ dùng; reset khi restart.
 */
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000; // 10 phút
const MAX = 5;                 // tối đa 5 đơn / 10 phút / IP

/** true = cho phép; false = vượt ngưỡng. */
export function guestRateLimit(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX) { hits.set(key, arr); return false; }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear(); // chặn rò rỉ bộ nhớ
  return true;
}

/** IP khách (qua proxy Traefik) — lấy đầu chuỗi x-forwarded-for. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}
