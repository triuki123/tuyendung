import { NextResponse } from 'next/server';

/**
 * POST /api/auth/telegram/link — ĐÃ VÔ HIỆU HÓA (chính sách bảo mật).
 *
 * Người dùng KHÔNG được tự liên kết Telegram. Chỉ Quản trị viên tối cao (super_admin)
 * mới gắn telegram_id cho người dùng qua POST /api/users/[id]/telegram-link.
 * Endpoint này giữ lại để trả về thông báo rõ ràng (tránh client cũ gọi nhầm).
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Tự liên kết Telegram đã bị tắt. Vui lòng liên hệ Quản trị viên tối cao để được cấp quyền đăng nhập Telegram.',
    },
    { status: 403 }
  );
}
