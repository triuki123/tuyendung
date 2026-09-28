/**
 * Đồng bộ tin nhắn duyệt Telegram khi trạng thái yêu cầu thay đổi.
 *
 * Vấn đề: tin nhắn duyệt (kèm nút ✅ Duyệt / ❌ Từ chối) được gửi tới NGƯỜI DUYỆT.
 * Khi họ bấm nút trong bot, webhook tự gỡ nút. Nhưng khi họ (hoặc người khác)
 * duyệt/từ chối/huỷ TRÊN WEB, tin nhắn Telegram vẫn còn nút + vẫn "Chờ duyệt".
 *
 * Giải pháp: mỗi lần gửi yêu cầu duyệt, lưu (type, request_id, chat_id, message_id)
 * vào bảng `telegram_approval_messages`. Khi yêu cầu được xử lý (ở bất kỳ đâu),
 * gọi `resolveApprovalMessages()` để sửa toàn bộ tin nhắn (nhiều người nhận) →
 * gỡ nút + đổi trạng thái → rồi xoá bản ghi.
 */
import { execute, query } from '@/lib/db';
import { editTelegramMessage } from '@/lib/services/telegramService';
import { REGISTRY, type ApprovalType } from '@/lib/telegram/approvalRegistry';

/** Lưu 1 tin nhắn duyệt đã gửi (fire-and-forget, lỗi không làm hỏng luồng chính). */
export async function recordApprovalMessage(
  type: ApprovalType,
  requestId: string,
  chatId: string,
  messageId: number,
): Promise<void> {
  try {
    await execute(
      `INSERT INTO telegram_approval_messages (id, type, request_id, chat_id, message_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [`tam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type, requestId, chatId, messageId],
    );
  } catch (e) {
    console.error('recordApprovalMessage error:', e);
  }
}

type ResolvedAction = 'approved' | 'rejected' | 'cancelled';

const ACTION_META: Record<ResolvedAction, { icon: string; label: string }> = {
  approved:  { icon: '✅', label: 'Đã duyệt' },
  rejected:  { icon: '❌', label: 'Đã từ chối' },
  cancelled: { icon: '🚫', label: 'Đã huỷ' },
};

/**
 * Sửa toàn bộ tin nhắn duyệt của 1 yêu cầu (gỡ nút + cập nhật trạng thái) rồi xoá bản ghi.
 * Gọi sau khi duyệt/từ chối/huỷ thành công (cả luồng web lẫn Telegram đều an toàn — idempotent).
 */
export async function resolveApprovalMessages(
  type: ApprovalType,
  requestId: string,
  action: ResolvedAction,
  approverName?: string | null,
): Promise<void> {
  try {
    const rows = await query<{ id: string; chat_id: string; message_id: string }>(
      `SELECT id, chat_id, message_id FROM telegram_approval_messages
       WHERE type = $1 AND request_id = $2`,
      [type, requestId],
    );
    if (rows.length === 0) return;

    const meta = ACTION_META[action];
    const label = REGISTRY[type]?.label ?? 'Yêu cầu';
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const who = approverName ? `\n👤 Người xử lý: ${approverName}` : '';
    const text = `${meta.icon} *${meta.label}* — ${label}${who}\n🕒 ${now}`;

    await Promise.all(
      rows.map((r) => editTelegramMessage(r.chat_id, Number(r.message_id), text).catch(() => {})),
    );

    await execute(
      `DELETE FROM telegram_approval_messages WHERE type = $1 AND request_id = $2`,
      [type, requestId],
    );
  } catch (e) {
    console.error('resolveApprovalMessages error:', e);
  }
}
