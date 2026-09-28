import { query, execute, buildInsert, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext, getCompanyMemberUserIds } from '@/lib/services/userCompanyService';
import { getOrgSubtreeUserIds } from '@/lib/services/attendanceService';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = await getEffectiveContext(userId, activeCompany);
    const role = effectiveContext?.role ?? 'user';

    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');
    const status = searchParams.get('status');

    const conditions: string[] = [];
    const params: any[] = [];

    // Scope theo company active — tài sản cũ không có company_id chỉ super_admin thấy
    if (role === 'super_admin') {
      // Xem tất cả
    } else if (role === 'admin') {
      if (activeCompany) {
        params.push(activeCompany);
        conditions.push(`(company_id = $${params.length} OR company_id IS NULL)`);
      }
    } else if (role === 'manager') {
      // Manager chỉ thấy tài sản giao cho cấp dưới trong công ty
      const subordinateIds = await getOrgSubtreeUserIds(userId, activeCompany);
      const allIds = [userId, ...subordinateIds];
      params.push(allIds);
      conditions.push(`assigned_to::text = ANY($${params.length}::text[])`);
      if (activeCompany) {
        params.push(activeCompany);
        conditions.push(`(company_id = $${params.length} OR company_id IS NULL)`);
      }
    } else {
      // Người dùng thường: chỉ tài sản được giao cho mình
      params.push(userId);
      conditions.push(`assigned_to::text = $${params.length}`);
    }

    if (department) {
      params.push(department);
      conditions.push(`department = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM assets ${where} ORDER BY created_at DESC`;

    const data = await query(sql, params);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Assets fetch error:', error);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const effectiveContext = await getEffectiveContext(userId, activeCompany);
    const role = effectiveContext?.role ?? 'user';

    if (role !== 'super_admin' && role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền tạo tài sản' }, { status: 403 });
    }

    const body = await request.json();

    // Ép company_id theo công ty active của người tạo (không tin body client)
    const companyId = role === 'super_admin'
      ? (body.company_id || activeCompany || null)
      : activeCompany;

    const assetData = {
      code: body.code,
      name: body.name,
      category: body.category,
      brand: body.brand,
      model: body.model,
      serial_number: body.serial_number,
      status: body.status,
      assigned_to: body.assigned_to || null,
      assigned_to_name: body.assigned_to_name || null,
      department: body.department,
      purchase_date: body.purchase_date,
      warranty_expiry: body.warranty_expiry,
      warranty_status: body.warranty_status ?? null,
      warranty_months: body.warranty_months ?? null,
      value: body.value,
      condition: body.condition,
      location: body.location,
      notes: body.notes,
      image_url: body.image_url || '',
      company_id: companyId,
    };

    const { text, params } = buildInsert('assets', assetData);
    const createdAsset = await queryOne(text, params);

    if (!createdAsset) {
      throw new Error('Insert did not return a row');
    }

    // Add audit log (non-blocking)
    try {
      const performedBy = body.performed_by || 'System';
      const adminId = body.admin_id || performedBy;

      const { text: auditText, params: auditParams } = buildInsert('audit_logs', {
        admin_id: adminId,
        action: 'asset_created',
        details: `Created asset: ${createdAsset.name} (${createdAsset.code})`,
        asset_id: createdAsset.id,
        asset_code: createdAsset.code,
        asset_name: createdAsset.name,
        asset_type: 'hardware',
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      });
      await queryOne(auditText, auditParams);
    } catch (auditErr) {
      console.warn('Failed to add audit log:', auditErr);
      // Don't throw - main operation succeeded
    }

    return NextResponse.json(createdAsset);
  } catch (error) {
    console.error('Asset creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create asset' },
      { status: 500 }
    );
  }
}
