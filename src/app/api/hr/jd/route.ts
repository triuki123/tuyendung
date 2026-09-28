import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

/** GET /api/hr/jd — danh sách JD. Query: ?status= */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const ctx = userId ? await getEffectiveContext(userId, activeCompany) : null;
    const role = ctx?.role || '';
    const allowed = ['super_admin', 'admin', 'manager'].includes(role) || checkUnitAccess(request, 'hr-jd', 'view');
    if (!allowed) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const data = await pool.listJds(status);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/jd error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/hr/jd — thêm JD (multipart/form-data)
 * Trường: title, department_name?, description?, status?, file?
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Kho JD', '/nguon-nhan-luc/kho-mo-ta-cong-viec');
async function POSTHandler(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const ctx = userId ? await getEffectiveContext(userId, activeCompany) : null;
    const role = ctx?.role || '';
    const allowed = ['super_admin', 'admin', 'manager'].includes(role) || checkUnitAccess(request, 'hr-jd', 'create');
    if (!allowed) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const form = await request.formData();
    const title = (form.get('title') as string)?.trim();
    if (!title) return NextResponse.json({ error: 'Thiếu tiêu đề JD' }, { status: 400 });

    const file = form.get('file');
    let buffer: Buffer | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    if (file instanceof File && file.size > 0) {
      buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name;
      mimeType = file.type || undefined;
    }
    const data = await pool.createJd({
      title,
      departmentName: (form.get('department_name') as string) || undefined,
      description: (form.get('description') as string) || undefined,
      status: (form.get('status') as string) || 'draft',
      fileName,
      mimeType,
      buffer,
      createdBy: userId,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/hr/jd error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 }
    );
  }
}
