import { NextRequest, NextResponse } from 'next/server';
import { deleteVoucher } from '@/lib/services/solaceVoucherService';
import { guardSolace } from '@/lib/solaceApiGuard';

export async function DELETE(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const g = await guardSolace(request, 'solace-menu', 'delete');
    if (g instanceof NextResponse) return g;
    await deleteVoucher(decodeURIComponent(params.code), g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/solace/vouchers/[code] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
