import { NextRequest, NextResponse } from 'next/server';
import { listOutbox } from '@/lib/services/emailCenterService';
import { getEmailCenterActions } from '../_perm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (acts.length === 0) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const category = request.nextUrl.searchParams.get('category') || undefined;
    const rows = await listOutbox(200, category);
    const filtered = rows.filter(r => !r.category || acts.includes(r.category) || acts.includes('manage'));
    return NextResponse.json({ success: true, data: filtered });
  } catch (err) {
    console.error('GET outbox error:', err);
    return NextResponse.json({ error: 'Lỗi' }, { status: 500 });
  }
}
