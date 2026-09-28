import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/services/emailCenterService';
import { requireAction } from '../../../_perm';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** POST /api/email-center/senders/[id]/test — gửi thử tới địa chỉ tùy chọn. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireAction(request, 'manage');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const body = await request.json();
    const to = String(body?.to || '').trim();
    if (!to) return NextResponse.json({ error: 'Nhập địa chỉ nhận' }, { status: 400 });
    await sendEmail({
      senderId: params.id, to,
      subject: 'Email thử — Trung Tâm Email',
      html: '<div style="font-family:Arial,sans-serif;padding:20px;"><h2>✅ Sender hoạt động</h2><p>Nếu bạn nhận được email này, cấu hình sender đang chạy đúng.</p></div>',
      sentBy: request.headers.get('x-current-user-id'),
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Gửi thử thất bại' }, { status: 400 });
  }
}
