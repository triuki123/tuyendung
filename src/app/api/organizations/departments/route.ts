import { NextRequest, NextResponse } from 'next/server';
import { departmentsService } from '@/lib/services/departmentsService';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';

/** null = super_admin (mọi công ty). Ngược lại: chỉ các công ty user thuộc về. */
async function visibleIds(request: NextRequest): Promise<string[] | null> {
  return getVisibleCompanyIds(request.headers.get('x-current-user-id'));
}
const inScope = (allowed: string[] | null, id: string) => allowed === null || allowed.includes(id);
const filterScope = <T extends { company_id: string }>(allowed: string[] | null, rows: T[]) =>
  allowed === null ? rows : rows.filter((r) => allowed.includes(r.company_id));

/**
 * Phòng ban được LIỆT KÊ: vai hiệu lực super_admin → mọi công ty; còn lại → CHỈ công ty
 * ĐANG CHỌN (vào công ty phụ = thoát vai công ty chính, không thấy phòng ban công ty mẹ).
 */
async function listableIds(request: NextRequest): Promise<string[] | null> {
  const allowed = await visibleIds(request);
  if (allowed === null) return null;
  const active = resolveDefaultCompanyId(allowed, request.headers.get('x-current-user-company'));
  return active ? [active] : [];
}

export async function GET(request: NextRequest) {
  try {
    const allowed = await visibleIds(request);
    const listable = await listableIds(request);
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const id = searchParams.get('id');
    const requestedCompanyId = searchParams.get('company_id');

    if (id) {
      const department = await departmentsService.getDepartmentById(id);
      if (!inScope(allowed, department.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      return NextResponse.json(department);
    }

    if (query) {
      const departments = await departmentsService.searchDepartments(query);
      return NextResponse.json(filterScope(listable, departments));
    }

    if (requestedCompanyId) {
      if (!inScope(allowed, requestedCompanyId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const departments = await departmentsService.getDepartmentsByCompany(requestedCompanyId);
      return NextResponse.json(departments);
    }

    // Hiện cả phòng ban đã ẩn (is_active=false) — CHỈ super_admin (allowed === null)
    const includeInactive = searchParams.get('include_inactive') === 'true' && allowed === null;
    const departments = await departmentsService.getAllDepartments(includeInactive);
    return NextResponse.json(filterScope(listable, departments));
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const allowed = await visibleIds(request);
    const body = await request.json();

    // Không phải super_admin → chỉ tạo trong công ty MÌNH THUỘC VỀ. Không nói rõ công ty
    // thì phòng ban vào công ty ĐANG CHỌN — trước đây rơi về allowed[0] (công ty chính),
    // tức đứng ở công ty phụ mà tạo phòng ban lại chui sang công ty mẹ.
    if (allowed !== null) {
      if (allowed.length === 0) return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
      if (!body.company_id) {
        body.company_id = resolveDefaultCompanyId(allowed, request.headers.get('x-current-user-company'));
      }
      if (!body.company_id || !allowed.includes(body.company_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const cleanedBody = {
      ...body,
      budget: body.budget === '' || body.budget === null ? null : Number(body.budget),
      display_order: body.display_order === '' || body.display_order === null ? null : Number(body.display_order),
      head_id: body.head_id === '' || body.head_id === null ? null : body.head_id,
      parent_department_id: body.parent_department_id === '' || body.parent_department_id === null ? null : body.parent_department_id,
      code: body.code === '' || body.code === null ? undefined : body.code,
      description: body.description === '' || body.description === null ? null : body.description,
    };

    const department = await departmentsService.createDepartment(cleanedBody);
    let headWarn: string | null = null;
    if (cleanedBody.head_id !== undefined && department?.id && department?.company_id) {
      const { trySetUnitHead } = await import('@/lib/services/orgStructureService');
      headWarn = await trySetUnitHead({ companyId: department.company_id, departmentId: department.id }, cleanedBody.head_id);
    }
    return NextResponse.json(headWarn ? { ...department, head_sync_warning: headWarn } : department, { status: 201 });
  } catch (error) {
    console.error('Error creating department:', error);
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const allowed = await visibleIds(request);
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'Department ID is required' }, { status: 400 });

    // Chỉ được sửa phòng ban thuộc công ty MÌNH THUỘC VỀ.
    const existing = await departmentsService.getDepartmentById(id);
    if (!inScope(allowed, existing.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // Không cho đổi company_id sang công ty ngoài phạm vi.
    if (updates.company_id && !inScope(allowed, updates.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const cleanedUpdates: Record<string, any> = { ...updates };
    if ('budget' in updates) cleanedUpdates.budget = updates.budget === '' || updates.budget === null ? null : Number(updates.budget);
    if ('display_order' in updates) cleanedUpdates.display_order = updates.display_order === '' || updates.display_order === null ? null : Number(updates.display_order);
    if ('head_id' in updates) cleanedUpdates.head_id = updates.head_id === '' || updates.head_id === null ? null : updates.head_id;
    if ('parent_department_id' in updates) cleanedUpdates.parent_department_id = updates.parent_department_id === '' || updates.parent_department_id === null ? null : updates.parent_department_id;
    if ('code' in updates) cleanedUpdates.code = updates.code === '' || updates.code === null ? null : updates.code;
    if ('description' in updates) cleanedUpdates.description = updates.description === '' || updates.description === null ? null : updates.description;

    const department = await departmentsService.updateDepartment(id, cleanedUpdates);
    let headWarn: string | null = null;
    if ('head_id' in updates && department?.id && department?.company_id) {
      const { trySetUnitHead } = await import('@/lib/services/orgStructureService');
      headWarn = await trySetUnitHead({ companyId: department.company_id, departmentId: department.id }, cleanedUpdates.head_id);
    }
    return NextResponse.json(headWarn ? { ...department, head_sync_warning: headWarn } : department);
  } catch (error) {
    console.error('Error updating department:', error);
    return NextResponse.json({ error: 'Failed to update department' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const allowed = await visibleIds(request);
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Department ID is required' }, { status: 400 });

    const existing = await departmentsService.getDepartmentById(id);
    if (!inScope(allowed, existing.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const department = await departmentsService.deactivateDepartment(id);
    return NextResponse.json(department);
  } catch (error) {
    console.error('Error deactivating department:', error);
    return NextResponse.json({ error: 'Failed to deactivate department' }, { status: 500 });
  }
}
