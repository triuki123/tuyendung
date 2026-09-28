import { query, buildInsert, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAssetWithNames } from './_assetQuery';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getCompanyMemberUserIds, getEffectiveContext } from '@/lib/services/userCompanyService';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hardware', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const department = searchParams.get('department');
    const company = searchParams.get('company');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('perPage') || '10', 10) || 10));

    const conditions: string[] = [];
    const params: any[] = [];
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');

    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await getEffectiveContext(userId, activeCompany || null);
    if (!ctx) return NextResponse.json({ error: 'Không xác định được ngữ cảnh công ty' }, { status: 403 });
    const role = ctx.role;
    const companyId = ctx.company_id;

    if (role === 'admin') {
      if (!companyId) return NextResponse.json({ data: [], meta: { page, perPage, total: 0, totalPages: 1 } });
      params.push(companyId);
      conditions.push(`a.company_id::text = $${params.length}`);
    } else if (role === 'manager') {
      const subordinateIds = await getOrgSubtreeUserIds(userId, companyId);
      params.push([userId, ...subordinateIds]);
      conditions.push(`a.assigned_to::text = ANY($${params.length}::text[])`);
    } else if (role !== 'super_admin') {
      params.push(userId);
      conditions.push(`a.assigned_to::text = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`a.category = $${params.length}`);
    }
    if (department) {
      params.push(department);
      conditions.push(`(d.name = $${params.length} OR sd.name = $${params.length})`);
    }
    if (company) {
      params.push(company);
      conditions.push(`co.name = $${params.length}`);
    }
    if (search) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(
        a.code ILIKE $${params.length}
        OR a.name ILIKE $${params.length}
        OR COALESCE(a.serial_number, '') ILIKE $${params.length}
        OR COALESCE(a.assigned_to_name, '') ILIKE $${params.length}
      )`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM assets a
      LEFT JOIN departments d       ON d.id::text  = a.department_id::text
      LEFT JOIN sub_departments sd  ON sd.id::text = a.sub_department_id::text
      LEFT JOIN companies co        ON co.id::text = a.company_id::text
      ${where}`;
    const sql = `
      SELECT a.*,
        ac.name AS category_name,
        co.name AS company_name,
        d.name  AS department_name,
        sd.name AS sub_department_name
      FROM assets a
      LEFT JOIN asset_categories ac ON ac.id::text = a.category::text
      LEFT JOIN companies co        ON co.id::text = a.company_id::text
      LEFT JOIN departments d       ON d.id::text  = a.department_id::text
      LEFT JOIN sub_departments sd  ON sd.id::text = a.sub_department_id::text
      ${where}
      ORDER BY a.created_at DESC`;

    const offset = (page - 1) * perPage;
    const pagedSql = `${sql} LIMIT ${perPage} OFFSET ${offset}`;
    const [data, countRow] = await Promise.all([
      query(pagedSql, params),
      queryOne<{ total: number }>(countSql, params),
    ]);
    return NextResponse.json({
      data: data || [],
      meta: {
        page,
        perPage,
        total: countRow?.total || 0,
        totalPages: Math.max(1, Math.ceil((countRow?.total || 0) / perPage)),
      },
    });
  } catch (error) {
    console.error('Hardware fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch hardware' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hardware', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const userId = request.headers.get('x-current-user-id');
    const activeCompany = request.headers.get('x-current-user-company');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await getEffectiveContext(userId, activeCompany || null);
    if (!ctx) return NextResponse.json({ error: 'Không xác định được ngữ cảnh công ty' }, { status: 403 });
    const role = ctx.role;
    const companyId = ctx.company_id;
    if (role !== 'super_admin' && !companyId) {
      return NextResponse.json({ error: 'Tài khoản chưa được gán công ty' }, { status: 403 });
    }
    if (role !== 'super_admin' && body.assigned_to) {
      const allowedUserIds = role === 'admin'
        ? await getCompanyMemberUserIds(companyId!)
        : [userId, ...(role === 'manager' ? await getOrgSubtreeUserIds(userId, companyId) : [])];
      if (!allowedUserIds.includes(body.assigned_to)) {
        return NextResponse.json({ error: 'Không được phân bổ tài sản ngoài phạm vi quản lý' }, { status: 403 });
      }
    }

    if (!body.code?.trim())     return NextResponse.json({ error: 'Mã tài sản là bắt buộc', code: 'MISSING_CODE' }, { status: 400 });
    if (!body.name?.trim())     return NextResponse.json({ error: 'Tên tài sản là bắt buộc', code: 'MISSING_NAME' }, { status: 400 });
    if (!body.category?.trim()) return NextResponse.json({ error: 'Loại tài sản là bắt buộc', code: 'MISSING_CATEGORY' }, { status: 400 });

    if (body.serial_number?.trim()) {
      const existing = await queryOne<{ id: string; code: string; name: string }>(
        `SELECT id, code, name FROM assets WHERE serial_number = $1 LIMIT 1`,
        [body.serial_number.trim()]
      );
      if (existing) {
        return NextResponse.json(
          {
            error: `Số serial "${body.serial_number}" đã tồn tại trên thiết bị "${existing.name}" (${existing.code})`,
            code: 'DUPLICATE_SERIAL',
            existing: { id: existing.id, code: existing.code, name: existing.name },
          },
          { status: 409 }
        );
      }
    }

    const rowData = {
      code: body.code.trim(),
      name: body.name.trim(),
      category: body.category,
      brand: body.brand || null,
      model: body.model || null,
      serial_number: body.serial_number?.trim() || null,
      status: body.status || 'active',
      assigned_to: body.assigned_to || null,
      assigned_to_name: body.assigned_to_name || null,
      company_id: role === 'super_admin' ? (body.company_id || null) : companyId,
      department_id: body.department_id || null,
      sub_department_id: body.sub_department_id || null,
      purchase_date: body.purchase_date || null,
      warranty_expiry: body.warranty_expiry || null,
      warranty_status: body.warranty_status || null,
      warranty_months: body.warranty_months || null,
      value: body.value || null,
      condition: body.condition || null,
      location: body.location || null,
      notes: body.notes || null,
      image_url: body.image_url || '',
    };

    let created: any;
    try {
      const { text, params } = buildInsert('assets', rowData);
      created = await queryOne(text, params);
    } catch (dbErr: any) {
      if (dbErr?.code === '23505' && dbErr?.constraint?.includes('code')) {
        return NextResponse.json(
          { error: `Mã tài sản "${body.code}" đã tồn tại. Vui lòng dùng mã khác hoặc bấm nút làm mới mã.`, code: 'DUPLICATE_CODE' },
          { status: 409 }
        );
      }
      if (dbErr?.code === '23505' && dbErr?.constraint?.includes('serial')) {
        return NextResponse.json(
          { error: `Số serial "${body.serial_number}" đã tồn tại trên một thiết bị khác.`, code: 'DUPLICATE_SERIAL' },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    if (!created) throw new Error('Insert did not return a row');

    const withNames = await getAssetWithNames((created as any).id).catch(() => null);
    return NextResponse.json(withNames ?? created, { status: 201 });
  } catch (error: any) {
    console.error('Hardware creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi server khi tạo tài sản' },
      { status: 500 }
    );
  }
}
