import { NextRequest, NextResponse } from 'next/server';
import { deleteCashTxn } from '@/lib/services/solaceCashService';
import { guardSolace } from '@/lib/solaceApiGuard';

/** DELETE /api/solace/cash/[id] — xoá 1 dòng sổ quỹ (cần quyền solace-cash: delete). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await guardSolace(request, 'solace-cash', 'delete');
    if (g instanceof NextResponse) return g;
    await deleteCashTxn(params.id, g.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/solace/cash/[id] error:', err);
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
