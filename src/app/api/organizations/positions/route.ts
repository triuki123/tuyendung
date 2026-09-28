import { NextRequest, NextResponse } from 'next/server';
import { positionsService } from '@/lib/services/positionsService';
import { getVisibleCompanyIds, resolveDefaultCompanyId } from '@/lib/services/userCompanyService';
import { checkUnitAccess } from '@/lib/api-permissions';

/** null = super_admin (mọi công ty). Ngược lại: chỉ các công ty user thuộc về. */
async function visibleIds(request: NextRequest): Promise<string[] | null> {
  return getVisibleCompanyIds(request.headers.get('x-current-user-id'));
}

/** Công ty đang chọn trên switcher (middleware đã xác minh membership). */
const activeCompany = (request: NextRequest) => request.headers.get('x-current-user-company');
const inScope = (allowed: string[] | null, id: string) => allowed === null || allowed.includes(id);

export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const requestedCompanyId = new URL(request.url).searchParams.get('company_id');
    const allowed = await visibleIds(request);

    // Không chỉ định → dùng công ty ĐANG CHỌN trên switcher (không phải công ty chính)
    let companyId = requestedCompanyId ?? resolveDefaultCompanyId(allowed, activeCompany(request));
    if (allowed !== null) {
      if (!companyId || !allowed.includes(companyId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const positions = companyId
      ? await positionsService.getPositionsByCompany(companyId)
      : await positionsService.getAllPositions(); // chỉ super_admin không truyền công ty
    return NextResponse.json(positions || []);
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch positions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const currentUserId = request.headers.get('x-current-user-id');
    const allowed = await visibleIds(request);
    const body = await request.json();
    if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    // Tạo mới mà không nói rõ công ty → vào công ty ĐANG CHỌN, không phải công ty chính
    let companyId = body.company_id ?? resolveDefaultCompanyId(allowed, activeCompany(request));
    if (allowed !== null) {
      if (!companyId || !allowed.includes(companyId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!companyId) return NextResponse.json({ error: 'company_id is required' }, { status: 400 });

    const newPosition = await positionsService.createPosition({
      company_id: companyId,
      name: body.name,
      description: body.description,
      salary_range_min: body.salary_range_min,
      salary_range_max: body.salary_range_max,
      ...(Number.isInteger(Number(body.rank)) && Number(body.rank) >= 1 ? { rank: Number(body.rank) } : {}),
      created_by: currentUserId || undefined,
    });
    return NextResponse.json(newPosition, { status: 201 });
  } catch (error) {
    console.error('Error creating position:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create position' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const currentUserId = request.headers.get('x-current-user-id');
    const allowed = await visibleIds(request);
    const body = await request.json();
    const { id } = body;
    if (!id || !body.name) return NextResponse.json({ error: 'id and name are required' }, { status: 400 });

    const existing = await positionsService.getPositionById(id);
    if (!inScope(allowed, existing.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updatedPosition = await positionsService.updatePosition(id, {
      name: body.name,
      description: body.description,
      salary_range_min: body.salary_range_min,
      salary_range_max: body.salary_range_max,
      ...(Number.isInteger(Number(body.rank)) && Number(body.rank) >= 1 ? { rank: Number(body.rank) } : {}),
      updated_by: currentUserId || undefined,
    });
    return NextResponse.json(updatedPosition, { status: 200 });
  } catch (error) {
    console.error('Error updating position:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update position' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'organization', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const currentUserId = request.headers.get('x-current-user-id');
    const allowed = await visibleIds(request);
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const existing = await positionsService.getPositionById(id);
    if (!inScope(allowed, existing.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const deletedPosition = await positionsService.deactivatePosition(id, currentUserId || undefined);
    return NextResponse.json(deletedPosition, { status: 200 });
  } catch (error) {
    console.error('Error deleting position:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete position' }, { status: 500 });
  }
}
