import { NextRequest, NextResponse } from 'next/server';
import { getWorkerSession, workerUnauthorized } from '@/lib/warehouse/workerAuth';
import { listPosts } from '@/lib/services/warehouseService';

export const dynamic = 'force-dynamic';

/** Bảng tin kho (công nhân xem) */
export async function GET(request: NextRequest) {
  try {
    const session = getWorkerSession(request);
    if (!session) return workerUnauthorized();
    const rows = await listPosts(session.warehouseId);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/warehouse/posts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
