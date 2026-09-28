import { NextRequest, NextResponse } from 'next/server';

/**
 * ĐÃ NGỪNG: quản lý không còn gửi bảng công thủ công.
 * Hệ thống tự chốt & gửi về Bộ Phận Chấm Công khi tới hạn nộp
 * (xem attendanceAutoSendScheduler). Giữ endpoint để trả thông báo rõ ràng.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Bảng công được hệ thống tự động gửi khi tới hạn nộp — quản lý chỉ theo dõi.' },
    { status: 403 }
  );
}
