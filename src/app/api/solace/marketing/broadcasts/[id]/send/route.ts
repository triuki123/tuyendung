import { NextRequest, NextResponse } from 'next/server';
import { guardSolace } from '@/lib/solaceApiGuard';
import { getBroadcast, sendBroadcast } from '@/lib/services/solaceBroadcastService';

/**
 * Gửi NGAY 1 bài. Việc gửi (rate-limit theo số subscriber) chạy nền — trả 202 ngay,
 * UI poll lại danh sách để thấy trạng thái 'sent' + thống kê.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-marketing', 'edit');
    if (g instanceof NextResponse) return g;

    const b = await getBroadcast(params.id);
    if (!b) return NextResponse.json({ error: 'Không tìm thấy bài' }, { status: 404 });
    if (b.status !== 'draft' && b.status !== 'scheduled') {
      return NextResponse.json({ error: 'Bài đã gửi hoặc đang gửi' }, { status: 400 });
    }

    // Fire-and-forget: không chặn HTTP khi danh bạ lớn.
    void sendBroadcast(params.id).catch(e =>
      console.error('[marketing send] error', params.id, (e as Error).message));

    return NextResponse.json({ success: true, message: 'Đang gửi…' }, { status: 202 });
  } catch (err) {
    console.error('POST /api/solace/marketing/broadcasts/[id]/send error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
