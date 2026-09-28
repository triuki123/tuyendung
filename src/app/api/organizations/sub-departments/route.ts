import { NextRequest, NextResponse } from 'next/server';
import { subDepartmentsService } from '@/lib/services/subDepartmentsService';
import { query } from '@/lib/db';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';

type SubDepartmentRow = { id: string; department_id: string };

/**
 * Tập id PHÒNG BAN user được phép thao tác.
 *  - Vai hiệu lực super_admin → null (mọi phòng ban).
 *  - Còn lại → phòng ban của CÔNG TY ĐANG CHỌN. Vào công ty phụ = thoát vai công ty
 *    chính, không thấy/không đụng được bộ phận của công ty mẹ nữa.
 */
async function allowedDeptIds(request: NextRequest): Promise<Set<string> | null> {
  const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
  if (allowed === null) return null;
  const active = resolveDefaultCompanyId(allowed, request.headers.get('x-current-user-company'));
  if (!active) return new Set();
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM departments WHERE company_id = ANY($1::uuid[])`, [[active]]
  );
  return new Set(rows.map((r) => r.id));
}

export async function GET(request: NextRequest) {
  try {
    const allowed = await allowedDeptIds(request);
    const sp = request.nextUrl.searchParams;
    const queryText = sp.get('query');
    const id = sp.get('id');
    const departmentId = sp.get('department_id');

    if (id) {
      const sd = await subDepartmentsService.getSubDepartmentById(id);
      if (allowed && !allowed.has(sd.department_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return NextResponse.json(sd);
    }

    if (queryText) {
      const rows = await subDepartmentsService.searchSubDepartments(queryText);
      return NextResponse.json(allowed ? rows.filter((s: SubDepartmentRow) => allowed.has(s.department_id)) : rows);
    }

    if (departmentId) {
      if (allowed && !allowed.has(departmentId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const rows = await subDepartmentsService.getSubDepartmentsByDepartment(departmentId);
      return NextResponse.json(rows);
    }

    const includeInactive = sp.get('include_inactive') === 'true' && allowed === null;
    const rows = await subDepartmentsService.getAllSubDepartments(includeInactive);
    return NextResponse.json(allowed ? rows.filter((s: SubDepartmentRow) => allowed.has(s.department_id)) : rows);
  } catch (error) {
    console.error('Error fetching sub-departments:', error);
    return NextResponse.json({ error: 'Failed to fetch sub-departments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const allowed = await allowedDeptIds(request);
    const body = await request.json();
    if (allowed && !allowed.has(body.department_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const cleanedBody = {
      ...body,
      budget: body.budget === '' || body.budget === null ? null : Number(body.budget),
      display_order: body.display_order === '' || body.display_order === null ? null : Number(body.display_order),
      head_id: body.head_id === '' || body.head_id === null ? null : body.head_id,
      parent_sub_department_id: body.parent_sub_department_id === '' || body.parent_sub_department_id === null ? null : body.parent_sub_department_id,
      code: body.code === '' || body.code === null ? null : body.code,
      description: body.description === '' || body.description === null ? null : body.description,
    };

    const subDepartment = await subDepartmentsService.createSubDepartment(cleanedBody);
    let headWarn: string | null = null;
    if (cleanedBody.head_id !== undefined && subDepartment?.id && subDepartment?.department_id) {
      const dept = await query<{ company_id: string }>(
        'SELECT company_id::text AS company_id FROM departments WHERE id::text = $1', [subDepartment.department_id]);
      if (dept[0]?.company_id) {
        const { trySetUnitHead } = await import('@/lib/services/orgStructureService');
        headWarn = await trySetUnitHead(
          { companyId: dept[0].company_id, departmentId: subDepartment.department_id, subDepartmentId: subDepartment.id },
          cleanedBody.head_id);
      }
    }
    return NextResponse.json(headWarn ? { ...subDepartment, head_sync_warning: headWarn } : subDepartment, { status: 201 });
  } catch (error) {
    console.error('Error creating sub-department:', error);
    return NextResponse.json({ error: 'Failed to create sub-department' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const allowed = await allowedDeptIds(request);
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'Sub-Department ID is required' }, { status: 400 });

    const existing = await subDepartmentsService.getSubDepartmentById(id);
    if (allowed && !allowed.has(existing.department_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (allowed && updates.department_id && !allowed.has(updates.department_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const cleanedUpdates: Record<string, any> = { ...updates };
    if ('budget' in updates) cleanedUpdates.budget = updates.budget === '' || updates.budget === null ? null : Number(updates.budget);
    if ('display_order' in updates) cleanedUpdates.display_order = updates.display_order === '' || updates.display_order === null ? null : Number(updates.display_order);
    if ('head_id' in updates) cleanedUpdates.head_id = updates.head_id === '' || updates.head_id === null ? null : updates.head_id;
    if ('parent_sub_department_id' in updates) cleanedUpdates.parent_sub_department_id = updates.parent_sub_department_id === '' || updates.parent_sub_department_id === null ? null : updates.parent_sub_department_id;
    if ('code' in updates) cleanedUpdates.code = updates.code === '' || updates.code === null ? null : updates.code;
    if ('description' in updates) cleanedUpdates.description = updates.description === '' || updates.description === null ? null : updates.description;

    const subDepartment = await subDepartmentsService.updateSubDepartment(id, cleanedUpdates);
    let headWarn: string | null = null;
    if ('head_id' in updates && subDepartment?.id && subDepartment?.department_id) {
      const dept = await query<{ company_id: string }>(
        'SELECT company_id::text AS company_id FROM departments WHERE id::text = $1', [subDepartment.department_id]);
      if (dept[0]?.company_id) {
        const { trySetUnitHead } = await import('@/lib/services/orgStructureService');
        headWarn = await trySetUnitHead(
          { companyId: dept[0].company_id, departmentId: subDepartment.department_id, subDepartmentId: subDepartment.id },
          cleanedUpdates.head_id);
      }
    }
    return NextResponse.json(headWarn ? { ...subDepartment, head_sync_warning: headWarn } : subDepartment);
  } catch (error) {
    console.error('Error updating sub-department:', error);
    return NextResponse.json({ error: 'Failed to update sub-department' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const allowed = await allowedDeptIds(request);
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Sub-Department ID is required' }, { status: 400 });

    const existing = await subDepartmentsService.getSubDepartmentById(id);
    if (allowed && !allowed.has(existing.department_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const subDepartment = await subDepartmentsService.deactivateSubDepartment(id);
    return NextResponse.json(subDepartment);
  } catch (error) {
    console.error('Error deactivating sub-department:', error);
    return NextResponse.json({ error: 'Failed to deactivate sub-department' }, { status: 500 });
  }
}
