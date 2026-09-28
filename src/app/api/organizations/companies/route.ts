import { NextRequest, NextResponse } from 'next/server';
import { companiesService } from '@/lib/services/companiesService';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';

/** null = vai hiệu lực super_admin (mọi công ty). Ngược lại: chỉ công ty user thuộc về. */
async function visibleIds(request: NextRequest): Promise<string[] | null> {
  return getVisibleCompanyIds(request.headers.get('x-current-user-id'));
}
const inScope = (allowed: string[] | null, id: string) => allowed === null || allowed.includes(id);

/**
 * Công ty được LIỆT KÊ trong module Tổ Chức.
 *  - Vai hiệu lực super_admin (allowed = null) → null = mọi công ty. Đây là cửa duy nhất
 *    để quản trị các công ty mình KHÔNG là thành viên; siết chỗ này sẽ khoá super_admin
 *    khỏi chính những công ty đó (switcher chỉ liệt kê công ty mình thuộc về).
 *  - Còn lại → CHỈ công ty ĐANG CHỌN. Vào công ty phụ = thoát vai công ty chính, không
 *    được nhìn thấy công ty khác nữa.
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

    if (id) {
      if (!inScope(allowed, id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const company = await companiesService.getCompanyById(id);
      return NextResponse.json(company);
    }

    if (query) {
      const companies = await companiesService.searchCompanies(query);
      return NextResponse.json(listable === null ? companies : companies.filter((c) => listable.includes(c.id)));
    }

    // Hiện cả công ty đã ẩn (is_active=false) — CHỈ super_admin (allowed === null), yêu cầu tường minh
    const includeInactive = searchParams.get('include_inactive') === 'true' && allowed === null;
    const companies = await companiesService.getAllCompanies(includeInactive);
    return NextResponse.json(listable === null ? companies : companies.filter((c) => listable.includes(c.id)));
  } catch (error) {
    console.error('Error fetching companies:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    // Tạo MỘT công ty mới là thao tác cấp hệ thống → chỉ super_admin.
    const allowed = await visibleIds(request);
    if (allowed !== null) {
      return NextResponse.json({ error: 'Chỉ Super Admin được tạo công ty mới' }, { status: 403 });
    }
    const body = await request.json();
    const company = await companiesService.createCompany(body);
    let headWarn: string | null = null;
    if (body.head_id !== undefined && company?.id) {
      const { trySetUnitHead } = await import('@/lib/services/orgStructureService');
      headWarn = await trySetUnitHead({ companyId: company.id }, body.head_id || null);
    }
    return NextResponse.json(headWarn ? { ...company, head_sync_warning: headWarn } : company, { status: 201 });
  } catch (error: any) {
    console.error('Error creating company:', error);
    if (error?.code === '23505') return NextResponse.json({ error: 'Tên hoặc mã công ty đã tồn tại' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });

    // Chỉ được sửa công ty MÌNH THUỘC VỀ (super_admin: mọi công ty).
    const allowed = await visibleIds(request);
    if (!inScope(allowed, id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const company = await companiesService.updateCompany(id, updates);
    let headWarn: string | null = null;
    if ('head_id' in updates && company?.id) {
      const { trySetUnitHead } = await import('@/lib/services/orgStructureService');
      headWarn = await trySetUnitHead({ companyId: company.id }, updates.head_id || null);
    }
    return NextResponse.json(headWarn ? { ...company, head_sync_warning: headWarn } : company);
  } catch (error: any) {
    console.error('Error updating company:', error);
    if (error?.code === '23505') return NextResponse.json({ error: 'Tên hoặc mã công ty đã tồn tại' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });

    // Xoá MỘT công ty là thao tác cấp hệ thống → chỉ super_admin.
    const allowed = await visibleIds(request);
    if (allowed !== null) {
      return NextResponse.json({ error: 'Chỉ Super Admin được xóa công ty' }, { status: 403 });
    }

    const { execute } = await import('@/lib/db');
    await execute('DELETE FROM companies WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting company:', error);
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 });
  }
}
