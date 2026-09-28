import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { createCvIndustry, listCvIndustries } from '@/lib/services/hrPoolService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(request: NextRequest) {
  if (!checkUnitAccess(request, 'hr-cv', 'view')) {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  }
  return NextResponse.json({ success: true, data: await listCvIndustries() }, { headers: noStoreHeaders });
}

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function POSTHandler(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Thiếu tên thư mục' }, { status: 400 });
    const data = await createCvIndustry(name, request.headers.get('x-current-user-id'));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi server' }, { status: 400 });
  }
}
