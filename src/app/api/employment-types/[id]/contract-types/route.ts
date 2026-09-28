import { NextRequest, NextResponse } from 'next/server';
import {
  getContractTypesForEmploymentType,
  setContractTypesForEmploymentType,
} from '@/lib/services/employmentTypeContractService';
import { canManageEvaluations } from '@/lib/services/evaluationPermissionService';

export const dynamic = 'force-dynamic';

/** GET /api/employment-types/[id]/contract-types — loại HĐ đã gắn cho hình thức làm việc. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const data = await getContractTypesForEmploymentType(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/employment-types/[id]/contract-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/employment-types/[id]/contract-types — set danh sách loại HĐ (cần quyền edit). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageEvaluations(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const ids: string[] = Array.isArray(body.contract_type_ids) ? body.contract_type_ids : [];
    await setContractTypesForEmploymentType(params.id, ids);
    const data = await getContractTypesForEmploymentType(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/employment-types/[id]/contract-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
