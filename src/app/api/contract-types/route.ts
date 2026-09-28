import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/contractTypeService';
import { canManageContracts } from '@/lib/services/contractPermissionService';

export const dynamic = 'force-dynamic';

/** GET /api/contract-types?all=1 — danh sách loại hợp đồng. */
export async function GET(request: NextRequest) {
  try {
    const all = request.nextUrl.searchParams.get('all') === '1';
    const data = await svc.listContractTypes(all);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/contract-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** POST /api/contract-types — tạo loại HĐ (cần quyền hr.edit). */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    if (!(await canManageContracts(userId, 'edit'))) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ error: 'Thiếu tên' }, { status: 400 });
    const row = await svc.createContractType({
      name: body.name,
      description: body.description ?? null,
      code: body.code ?? null,
      code_template: body.code_template ?? null,
      sort_order: body.sort_order,
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (err) {
    console.error('POST /api/contract-types error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
