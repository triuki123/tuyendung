import { NextRequest, NextResponse } from 'next/server';
import { getBankConfig } from '@/lib/services/solaceSettingsService';
import { requireLogin } from '@/lib/solaceApiGuard';

// Thông tin tài khoản ngân hàng quán (để khách dựng VietQR nạp ví). Mọi user đã đăng nhập.
export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const bank = await getBankConfig();
    return NextResponse.json({ success: true, data: bank });
  } catch (err) {
    console.error('GET /api/solace/bank-info error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
