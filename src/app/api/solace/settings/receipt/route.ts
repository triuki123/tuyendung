import { NextRequest, NextResponse } from 'next/server';
import { getReceiptConfig } from '@/lib/services/solaceSettingsService';
import { requireLogin } from '@/lib/solaceApiGuard';

/** Cấu hình hoá đơn để in bill — nhân viên POS (đã đăng nhập) đọc được, không chỉ super admin. */
export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const data = await getReceiptConfig();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/settings/receipt error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
