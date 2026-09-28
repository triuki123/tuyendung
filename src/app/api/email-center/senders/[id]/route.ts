import { NextRequest, NextResponse } from 'next/server';
import { updateSender, deleteSender } from '@/lib/services/emailCenterService';
import { requireAction } from '../../_perm';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireAction(request, 'manage');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const body = await request.json();
    const s = await updateSender(params.id, body);
    return NextResponse.json({ success: true, data: s });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Lỗi' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = requireAction(request, 'manage');
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  await deleteSender(params.id);
  return NextResponse.json({ success: true });
}
