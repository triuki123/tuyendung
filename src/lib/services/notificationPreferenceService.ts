/**
 * notificationPreferenceService — tùy chọn nhận thông báo theo LOẠI SỰ KIỆN × KÊNH.
 *
 * Quy ước: chỉ lưu bản ghi TẮT (enabled=false). Không có bản ghi = mặc định BẬT.
 * ⇒ bảng rỗng = gửi như cũ (behavior-preserving). In-app không quản ở đây (luôn bật).
 */
import { query, execute } from '@/lib/db';

export type PrefChannel = 'telegram' | 'webpush';

export interface PreferenceRow {
  event_key: string;
  channel: string;
  enabled: boolean;
}

/**
 * Lấy tập KÊNH BỊ TẮT cho 1 event, theo từng người nhận.
 * Trả Map<userId, Set<channel>>. Dùng trong engine để bỏ qua kênh khi gửi.
 * Lỗi/bảng chưa migrate → Map rỗng (không chặn gửi → an toàn).
 */
export async function getDisabledChannelsForEvent(
  eventKey: string,
  userIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return map;
  try {
    const rows = await query<{ user_id: string; channel: string }>(
      `SELECT user_id::text AS user_id, channel
         FROM notification_preferences
        WHERE event_key = $1 AND user_id::text = ANY($2) AND enabled = false`,
      [eventKey, ids],
    );
    for (const r of rows) {
      const set = map.get(r.user_id) || new Set<string>();
      set.add(r.channel);
      map.set(r.user_id, set);
    }
  } catch {
    // bảng chưa tồn tại → coi như không tắt gì
  }
  return map;
}

/** Danh sách override (đang TẮT) của 1 user — để hiển thị ở UI. */
export async function getUserPreferences(userId: string): Promise<PreferenceRow[]> {
  return query<PreferenceRow>(
    `SELECT event_key, channel, enabled FROM notification_preferences
      WHERE user_id = $1 AND enabled = false`,
    [userId],
  );
}

/**
 * Cập nhật 1 tùy chọn. enabled=true → xoá override (về mặc định bật);
 * enabled=false → ghi override tắt.
 */
export async function setUserPreference(
  userId: string,
  eventKey: string,
  channel: PrefChannel,
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    await execute(
      `DELETE FROM notification_preferences WHERE user_id = $1 AND event_key = $2 AND channel = $3`,
      [userId, eventKey, channel],
    );
  } else {
    await execute(
      `INSERT INTO notification_preferences (user_id, event_key, channel, enabled, updated_at)
       VALUES ($1, $2, $3, false, NOW())
       ON CONFLICT (user_id, event_key, channel)
         DO UPDATE SET enabled = false, updated_at = NOW()`,
      [userId, eventKey, channel],
    );
  }
}
