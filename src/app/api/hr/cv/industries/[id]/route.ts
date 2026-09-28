import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { deleteCvIndustry, renameCvIndustry } from '@/lib/services/hrPoolService';

export const dynamic = 'force-dynamic';

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Thiếu tên thư mục' }, { status: 400 });
    return NextResponse.json({ success: true, data: await renameCvIndustry(params.id, name) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 400 });
  }
}

export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const movedCount = await deleteCvIndustry(params.id);
    return NextResponse.json({ success: true, movedCount });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 400 });
  }
}
