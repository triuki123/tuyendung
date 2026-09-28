import { query } from '@/lib/db';
import { getRecipientRule, saveRecipientRule } from '@/lib/services/systemSettingsService';

/**
 * Service cấu hình module Đặt Phòng Họp.
 *
 * NGUỒN DUY NHẤT cho danh sách người nhận: system_settings → recipient.room_booking
 * (migration 168). Cấu hình được cả ở panel trong module LẪN tab "Người nhận" của
 * Cấu Hình Hệ Thống — cùng một chỗ. Trống → fallback env SUPER_ADMIN_TELEGRAM_CHAT_ID
 * (xem sendNewRoomBookingNotificationToAdmin).
 */

export interface RoomBookingSettings {
  notifyRecipients: string[]; // danh sách user_id
}

export async function getRoomBookingSettings(): Promise<RoomBookingSettings> {
  const rule = await getRecipientRule('room_booking');
  return { notifyRecipients: rule.userIds };
}

export async function updateRoomBookingSettings(
  settings: Partial<RoomBookingSettings>,
  updatedBy: string
): Promise<RoomBookingSettings> {
  const rule = await getRecipientRule('room_booking');
  const notifyRecipients = Array.isArray(settings.notifyRecipients)
    ? Array.from(new Set(settings.notifyRecipients.map(String).filter(Boolean)))
    : rule.userIds;
  await saveRecipientRule('room_booking', { ...rule, userIds: notifyRecipients }, updatedBy);
  return { notifyRecipients };
}

/**
 * Lấy danh sách Telegram chat_id của các user được cấu hình nhận thông báo.
 * Bỏ qua user: chưa link Telegram, KHÔNG bật "Bật Thông Báo" trong Phân Quyền
 * (telegram_enabled=false), hoặc đã khóa tài khoản.
 */
export async function getNotifyTelegramChatIds(): Promise<string[]> {
  const settings = await getRoomBookingSettings();
  if (!settings.notifyRecipients.length) return [];
  const rows = await query<{ telegram_chat_id: string }>(
    `SELECT telegram_chat_id FROM users
     WHERE id = ANY($1::uuid[])
       AND telegram_chat_id IS NOT NULL
       AND telegram_enabled = true
       AND status = 'active'`,
    [settings.notifyRecipients]
  );
  return rows.map(r => r.telegram_chat_id).filter(Boolean);
}

/**
 * Lấy danh sách user_id được cấu hình nhận thông báo (để gửi in-app notification).
 * Tôn trọng cờ telegram_enabled trong Phân Quyền user — TẮT thì không nhận gì cả
 * (in-app lẫn Telegram), nhất quán với hành vi nhãn "Bật/Tắt Thông Báo" trong UI.
 */
export async function getNotifyUserIds(): Promise<string[]> {
  const settings = await getRoomBookingSettings();
  if (!settings.notifyRecipients.length) return [];
  const rows = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE id = ANY($1::uuid[])
       AND telegram_enabled = true
       AND status = 'active'`,
    [settings.notifyRecipients]
  );
  return rows.map(r => r.id);
}
