import { NextRequest, NextResponse } from 'next/server';
import { sendTestEmail } from '@/lib/services/recruitmentEmailService';

export const dynamic = 'force-dynamic';

/** POST — gửi email thử để kiểm tra cấu hình SMTP. Body: { to }. */
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-current-user-role') || '';
    if (role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { to } = await request.json();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'Nhập email nhận thử hợp lệ' }, { status: 400 });
    }
    try {
      await sendTestEmail(to);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Gửi thử thất bại' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST email-settings/test error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
