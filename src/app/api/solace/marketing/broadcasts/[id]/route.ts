import { NextRequest, NextResponse } from 'next/server';
import { guardSolace } from '@/lib/solaceApiGuard';
import { getBroadcast, updateBroadcast, deleteBroadcast } from '@/lib/services/solaceBroadcastService';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-marketing', 'view');
    if (g instanceof NextResponse) return g;
    const data = await getBroadcast(params.id);
    if (!data) return NextResponse.json({ error: 'Không tìm thấy bài' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/solace/marketing/broadcasts/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-marketing', 'edit');
    if (g instanceof NextResponse) return g;
    const body = await request.json();
    if (!body?.title?.trim() || !body?.content?.trim()) {
      return NextResponse.json({ error: 'Thiếu tiêu đề hoặc nội dung' }, { status: 400 });
    }
    const data = await updateBroadcast(params.id, {
      title: String(body.title).trim(),
      content: String(body.content).trim(),
      imageUrl: body.imageUrl?.trim() || null,
      buttonLabel: body.buttonLabel?.trim() || null,
      buttonUrl: body.buttonUrl?.trim() || null,
      scheduledAt: body.scheduledAt || null,
    });
    if (!data) return NextResponse.json({ error: 'Không tìm thấy bài' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = (err as Error).message || 'Lỗi server';
    console.error('PUT /api/solace/marketing/broadcasts/[id] error:', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-marketing', 'delete');
    if (g instanceof NextResponse) return g;
    await deleteBroadcast(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/solace/marketing/broadcasts/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
