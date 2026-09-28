import { NextResponse } from 'next/server';
import { getPosMenu } from '@/lib/services/solaceCatalogService';

// Thực đơn cho cổng khách vãng lai (PUBLIC, không cần đăng nhập).
export async function GET() {
  try {
    const data = await getPosMenu();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/guest/menu error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
