import { NextRequest, NextResponse } from 'next/server';
import {
  getJobTitlesByCompany,
  getAllJobTitles,
  createJobTitle,
  updateJobTitle,
  deactivateJobTitle,
  getJobTitleById,
} from '@/lib/services/jobTitlesService';
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

    // Không chỉ định → công ty ĐANG CHỌN trên switcher (không phải công ty chính)
    const companyId = requestedCompanyId ?? resolveDefaultCompanyId(allowed, activeCompany(request));
    if (allowed !== null && (!companyId || !allowed.includes(companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const jobTitles = companyId ? await getJobTitlesByCompany(companyId) : await getAllJobTitles();
    return NextResponse.json(jobTitles || []);
  } catch (error) {
    console.error('Error fetching job titles:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch job titles' }, { status: 500 });
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

    // Tạo mới mà không nói rõ công ty → vào công ty ĐANG CHỌN, không phải công ty chính
    const companyId = body.company_id ?? resolveDefaultCompanyId(allowed, activeCompany(request));
    if (allowed !== null && (!companyId || !allowed.includes(companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!companyId || !body.title) return NextResponse.json({ error: 'company_id and title are required' }, { status: 400 });

    const newJobTitle = await createJobTitle(
      companyId,
      { title: body.title, description: body.description, rank: body.rank },
      currentUserId || undefined,
    );
    return NextResponse.json(newJobTitle, { status: 201 });
  } catch (error) {
    console.error('Error creating job title:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create job title' }, { status: 500 });
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
    if (!id || !body.title) return NextResponse.json({ error: 'id and title are required' }, { status: 400 });

    const existing = await getJobTitleById(id);
    if (!existing) return NextResponse.json({ error: 'Job title not found' }, { status: 404 });
    if (!inScope(allowed, existing.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updatedJobTitle = await updateJobTitle(
      id,
      { title: body.title, description: body.description, rank: body.rank },
      currentUserId || undefined,
    );
    return NextResponse.json(updatedJobTitle, { status: 200 });
  } catch (error) {
    console.error('Error updating job title:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update job title' }, { status: 500 });
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

    const existing = await getJobTitleById(id);
    if (!existing) return NextResponse.json({ error: 'Job title not found' }, { status: 404 });
    if (!inScope(allowed, existing.company_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const deletedJobTitle = await deactivateJobTitle(id, currentUserId || undefined);
    return NextResponse.json(deletedJobTitle, { status: 200 });
  } catch (error) {
    console.error('Error deleting job title:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete job title' }, { status: 500 });
  }
}
