import { NextRequest, NextResponse } from 'next/server';
import { getSmtpConfigMasked, saveSmtpConfig } from '@/lib/services/recruitmentEmailService';

export const dynamic = 'force-dynamic';

/** Chỉ admin/super_admin được xem & sửa cấu hình SMTP (chứa thông tin nhạy cảm). */
function isAdmin(request: NextRequest): boolean {
  const role = request.headers.get('x-current-user-role') || '';
  return role === 'admin' || role === 'super_admin';
}

/** GET — cấu hình SMTP (password đã che). */
export async function GET(request: NextRequest) {
  try {
    if (!isAdmin(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    return NextResponse.json({ success: true, data: await getSmtpConfigMasked() });
  } catch (err) {
    console.error('GET email-settings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT — lưu cấu hình SMTP (password rỗng = giữ nguyên). */
export async function PUT(request: NextRequest) {
  try {
    if (!isAdmin(request)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const b = await request.json();
    await saveSmtpConfig({
      enabled: !!b.enabled,
      host: typeof b.host === 'string' ? b.host.trim() : undefined,
      port: b.port ? Number(b.port) : undefined,
      secure: typeof b.secure === 'boolean' ? b.secure : undefined,
      user: typeof b.user === 'string' ? b.user.trim() : undefined,
      password: typeof b.password === 'string' ? b.password : '',
      fromName: typeof b.from_name === 'string' ? b.from_name : undefined,
      rejectUnauthorized: typeof b.reject_unauthorized === 'boolean' ? b.reject_unauthorized : undefined,
    }, request.headers.get('x-current-user-id'));
    return NextResponse.json({ success: true, data: await getSmtpConfigMasked() });
  } catch (err) {
    console.error('PUT email-settings error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
