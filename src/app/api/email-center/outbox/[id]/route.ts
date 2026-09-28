import { NextRequest, NextResponse } from 'next/server';
import { getOutbox, listOutboxAttachments } from '@/lib/services/emailCenterService';
import { getEmailCenterActions } from '../../_perm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const acts = getEmailCenterActions(request);
    if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const o = await getOutbox(params.id);
    if (!o) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (o.category && !acts.includes(o.category) && !acts.includes('manage'))
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const attachments = await listOutboxAttachments(o.id);
    return NextResponse.json({ success: true, data: { ...o, attachments } });
  } catch (err) {
    return NextResponse.json({ error: 'Lỗi' }, { status: 500 });
  }
}
