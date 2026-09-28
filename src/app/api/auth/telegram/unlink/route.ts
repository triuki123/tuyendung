import { NextResponse } from 'next/server';

/**
 * POST /api/auth/telegram/unlink — ĐÃ VÔ HIỆU HÓA (chính sách bảo mật).
 *
 * Người dùng KHÔNG được tự hủy liên kết Telegram. Chỉ Quản trị viên tối cao
 * (super_admin) mới gỡ qua DELETE /api/users/[id]/telegram-link.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Tự hủy liên kết Telegram đã bị tắt. Vui lòng liên hệ Quản trị viên tối cao.',
    },
    { status: 403 }
  );
}
