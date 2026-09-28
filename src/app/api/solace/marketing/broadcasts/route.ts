import { NextRequest, NextResponse } from 'next/server';
import { guardSolace } from '@/lib/solaceApiGuard';
import { listBroadcasts, createBroadcast } from '@/lib/services/solaceBroadcastService';

export async function GET(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-marketing', 'view');
    if (g instanceof NextResponse) return g;
    const data = await listBroadcasts();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/marketing/broadcasts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardSolace(request, 'solace-marketing', 'create');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (!body?.title?.trim() || !body?.content?.trim()) {
      return NextResponse.json({ error: 'Thiếu tiêu đề hoặc nội dung' }, { status: 400 });
    }
    const data = await createBroadcast({
      title: String(body.title).trim(),
      content: String(body.content).trim(),
      imageUrl: body.imageUrl?.trim() || null,
      buttonLabel: body.buttonLabel?.trim() || null,
      buttonUrl: body.buttonUrl?.trim() || null,
      scheduledAt: body.scheduledAt || null,
    }, g.userId);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/solace/marketing/broadcasts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
