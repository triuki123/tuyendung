import { NextRequest, NextResponse } from 'next/server';
import { getPosMenu } from '@/lib/services/solaceCatalogService';
import { requireLogin } from '@/lib/solaceApiGuard';

// Thực đơn cho POS & đặt món webapp (mọi user đã đăng nhập).
export async function GET(request: NextRequest) {
  try {
    const auth = requireLogin(request);
    if (auth instanceof NextResponse) return auth;
    const data = await getPosMenu();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/pos-menu error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
