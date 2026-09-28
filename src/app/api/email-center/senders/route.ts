import { NextRequest, NextResponse } from 'next/server';
import { listSenders, createSender } from '@/lib/services/emailCenterService';
import { getEmailCenterActions, requireAction } from '../_perm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const acts = getEmailCenterActions(request);
  if (acts === null) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  if (acts.length === 0) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  const rows = await listSenders(!acts.includes('manage'));
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(request: NextRequest) {
  const gate = requireAction(request, 'manage');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const body = await request.json();
    const s = await createSender(body);
    return NextResponse.json({ success: true, data: s });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Lỗi' }, { status: 400 });
  }
}
