/**
 * GET /api/organizations/unit-deputies?company_id=&department_id=&sub_department_id=&role=deputy|assistant
 *   → danh sách Phó (mặc định) hoặc Trợ lý hiện hành của đơn vị (kèm tên).
 * PUT /api/organizations/unit-deputies
 *   Body: { company_id, department_id?, sub_department_id?, user_ids: string[], role?: 'deputy'|'assistant' }
 *   → thay danh sách Phó/Trợ lý của đơn vị (NHIỀU người mỗi vai trò;
 *     đòi hỏi user đã có phân công tại công ty — "Phân công trước, gán chức sau").
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { setUnitDeputies, setUnitAssistants } from '@/lib/services/orgStructureService';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const companyId = sp.get('company_id');
    if (!companyId) return NextResponse.json({ error: 'Thiếu company_id' }, { status: 400 });

    // Không phải super_admin → chỉ đọc đơn vị của công ty MÌNH THUỘC VỀ.
    const allowedG = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    if (allowedG !== null && !allowedG.includes(companyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Chuẩn hoá: bộ phận truyền thiếu department_id cha → tự tra (khớp cách service lưu)
    let departmentId = sp.get('department_id') || null;
    const subDepartmentId = sp.get('sub_department_id') || null;
    if (subDepartmentId && !departmentId) {
      const parent = await query<{ department_id: string }>(
        `SELECT department_id::text AS department_id FROM sub_departments WHERE id::text = $1`,
        [subDepartmentId]
      );
      departmentId = parent[0]?.department_id ?? null;
    }

    const rows = await query<any>(
      `SELECT oa.user_id::text AS id, u.name, u.email, pos.name AS position_name
         FROM org_assignments oa
         JOIN users u ON u.id = oa.user_id AND u.status = 'active'
         LEFT JOIN positions pos ON pos.id = oa.position_id
        WHERE oa.company_id::text = $1
          AND oa.department_id IS NOT DISTINCT FROM $2::uuid
          AND oa.sub_department_id IS NOT DISTINCT FROM $3::uuid
          AND oa.org_role = $4 AND oa.is_active
        ORDER BY u.name`,
      [
        companyId,
        departmentId,
        subDepartmentId,
        sp.get('role') === 'assistant' ? 'assistant' : 'deputy',
      ]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/organizations/unit-deputies error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    if (!body.company_id || !Array.isArray(body.user_ids)) {
      return NextResponse.json({ error: 'Thiếu company_id hoặc user_ids' }, { status: 400 });
    }

    // Không phải super_admin → chỉ thao tác trong công ty MÌNH THUỘC VỀ.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    if (allowed !== null && !allowed.includes(body.company_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const unit = {
      companyId: body.company_id,
      departmentId: body.department_id || null,
      subDepartmentId: body.sub_department_id || null,
    };
    if (body.role === 'assistant') {
      await setUnitAssistants(unit, body.user_ids);
    } else {
      await setUnitDeputies(unit, body.user_ids);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/organizations/unit-deputies error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 400 }
    );
  }
}
