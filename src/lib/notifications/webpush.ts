/**
 * webpush.ts — kênh Web Push (đẩy về desktop/điện thoại khi app đóng).
 *
 * AN TOÀN DEPLOY: nếu thiếu VAPID env → module ở trạng thái "ngủ", mọi hàm no-op.
 * Bảng push_subscriptions rỗng (chưa ai bật) → không gửi gì → hành vi y như cũ.
 */
import webpush from 'web-push';
import { query, execute } from '@/lib/db';

let configured: boolean | null = null;

/** Cấu hình VAPID 1 lần; trả false nếu thiếu key (kênh ngủ). */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:it@fadogroup.com.au';
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  } catch (e) {
    console.error('[webpush] setVapidDetails lỗi:', (e as Error).message);
    configured = false;
  }
  return configured;
}

export function isWebPushConfigured(): boolean {
  return ensureConfigured();
}

interface PushSubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string | null;
  icon?: string | null;
}

/**
 * Gửi push tới MỌI thiết bị đã đăng ký của các user. Fire-and-forget, tự dọn
 * subscription hỏng (404/410). Không cấu hình / không subscription → không làm gì.
 */
export async function sendWebPushToUsers(
  userIds: string[],
  payload: WebPushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return;

  let subs: PushSubRow[];
  try {
    subs = await query<PushSubRow>(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id::text = ANY($1)`,
      [ids],
    );
  } catch (e) {
    // Bảng chưa migrate → im lặng (không vỡ luồng thông báo chính).
    return;
  }
  if (subs.length === 0) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    icon: payload.icon || '/icon-192.png',
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          // Subscription hết hạn/không còn → xoá.
          await execute(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]).catch(() => {});
        } else {
          console.error('[webpush] gửi lỗi:', code, err?.body || err?.message);
        }
      }
    }),
  );
}
