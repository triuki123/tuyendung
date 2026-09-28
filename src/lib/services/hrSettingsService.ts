import { query, queryOne, execute } from '@/lib/db';
import { getRecipientRule, saveRecipientRule } from '@/lib/services/systemSettingsService';

const REMINDER_DEPT_KEY = 'reminder_department_ids';

/** Danh sách department_id (phòng ban C&B) nhận nhắc gia hạn hợp đồng. */
export async function getReminderDepartmentIds(): Promise<string[]> {
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM hr_settings WHERE key = $1`,
    [REMINDER_DEPT_KEY]
  );
  if (!row) return [];
  // pg trả JSONB đã parse → có thể là mảng sẵn
  const v = row.value;
  if (Array.isArray(v)) return v.map(String);
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function setReminderDepartmentIds(ids: string[]): Promise<void> {
  const clean = Array.from(new Set((ids || []).map((s) => String(s)).filter(Boolean)));
  await execute(
    `INSERT INTO hr_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [REMINDER_DEPT_KEY, JSON.stringify(clean)]
  );
}

// =============================================================================
// Người nhận thông báo Quản Lý Hồ Sơ
// NGUỒN DUY NHẤT: system_settings → recipient.hr_general (migration 168).
// Cấu hình được cả ở tab "Cài Đặt" của module HR LẪN tab "Người nhận" của
// Cấu Hình Hệ Thống — cùng đọc/ghi một chỗ.
// =============================================================================

/** Đọc danh sách user_id nhận thông báo HR (từ recipient.hr_general). */
export async function getHrNotifyRecipientUserIds(): Promise<string[]> {
  const rule = await getRecipientRule('hr_general');
  return rule.userIds;
}

export async function setHrNotifyRecipientUserIds(ids: string[]): Promise<void> {
  const clean = Array.from(new Set((ids || []).map((s) => String(s)).filter(Boolean)));
  const rule = await getRecipientRule('hr_general');
  await saveRecipientRule('hr_general', { ...rule, userIds: clean }, null);
}

/**
 * Lấy danh sách user_id thực sự nhận in-app thông báo Quản Lý Hồ Sơ.
 * Lọc user đã tắt "Bật Thông Báo" (telegram_enabled=false) hoặc bị khóa.
 */
export async function getHrNotifyUserIds(): Promise<string[]> {
  const ids = await getHrNotifyRecipientUserIds();
  if (ids.length === 0) return [];
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM users
      WHERE id::text = ANY($1::text[])
        AND telegram_enabled = true
        AND status = 'active'`,
    [ids]
  );
  return rows.map(r => r.id);
}

/**
 * Lấy danh sách Telegram chat_id của recipients đã cấu hình.
 * Bỏ qua user chưa link Telegram, đã tắt "Bật Thông Báo", hoặc khóa tài khoản.
 */
export async function getHrNotifyTelegramChatIds(): Promise<string[]> {
  const ids = await getHrNotifyRecipientUserIds();
  if (ids.length === 0) return [];
  const rows = await query<{ telegram_chat_id: string }>(
    `SELECT telegram_chat_id FROM users
      WHERE id::text = ANY($1::text[])
        AND telegram_chat_id IS NOT NULL
        AND telegram_enabled = true
        AND status = 'active'`,
    [ids]
  );
  return rows.map(r => r.telegram_chat_id).filter(Boolean);
}
