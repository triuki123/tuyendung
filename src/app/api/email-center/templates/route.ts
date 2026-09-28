import { NextRequest, NextResponse } from 'next/server';
import { listTemplates, createTemplate } from '@/lib/services/emailCenterService';
import { getEmailCenterActions, requireAction } from '../_perm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (acts.length === 0) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const category = request.nextUrl.searchParams.get('category') || undefined;
    const list = await listTemplates(category);
    // Ẩn template thuộc category user không có action
    const filtered = list.filter(t => acts.includes(t.category) || acts.includes('manage'));
    return NextResponse.json({ success: true, data: filtered });
  } catch (err) {
    console.error('GET /api/email-center/templates error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = requireAction(request, 'manage');
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const body = await request.json();
    const t = await createTemplate(body);
    return NextResponse.json({ success: true, data: t });
  } catch (err: any) {
    console.error('POST /api/email-center/templates error:', err);
    return NextResponse.json({ error: err?.message || 'Lỗi' }, { status: 400 });
  }
}
