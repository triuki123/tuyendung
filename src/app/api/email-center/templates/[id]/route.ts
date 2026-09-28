import { NextRequest, NextResponse } from 'next/server';
import { getTemplate, updateTemplate, deleteTemplate } from '@/lib/services/emailCenterService';
import { getEmailCenterActions, requireAction } from '../../_perm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const t = await getTemplate(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!acts.includes(t.category) && !acts.includes('manage')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    return NextResponse.json({ success: true, data: t });
  } catch (err) {
    console.error('GET template error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = requireAction(request, 'manage');
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const body = await request.json();
    const t = await updateTemplate(params.id, body);
    return NextResponse.json({ success: true, data: t });
  } catch (err: any) {
    console.error('PUT template error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi lưu' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = requireAction(request, 'manage');
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    await deleteTemplate(params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE template error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi xóa' }, { status: 400 });
  }
}
