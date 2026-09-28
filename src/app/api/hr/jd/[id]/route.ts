import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const ctx = userId ? await getEffectiveContext(userId, activeCompany) : null;
    const role = ctx?.role || '';
    if (!['super_admin', 'admin', 'manager'].includes(role) && !checkUnitAccess(request, 'hr-jd', 'view')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }

    const doc = await pool.getJdContent(params.id);
    if (!doc) return NextResponse.json({ error: 'Khong tim thay tep' }, { status: 404 });

    return new NextResponse(doc.content as any, {
      headers: {
        'Content-Type': doc.mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
      },
    });
  } catch (err) {
    console.error('GET /api/hr/jd/:id error:', err);
    return NextResponse.json({ error: 'Loi server' }, { status: 500 });
  }
}

import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Kho JD', '/nguon-nhan-luc/kho-mo-ta-cong-viec');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const ctx = userId ? await getEffectiveContext(userId, activeCompany) : null;
    const role = ctx?.role || '';
    if (!['super_admin', 'admin', 'manager'].includes(role) && !checkUnitAccess(request, 'hr-jd', 'edit')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    let data;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      let buffer: Buffer | null | undefined = undefined;
      let fileName: string | null | undefined = undefined;
      let mimeType: string | null | undefined = undefined;

      if (file instanceof File) {
        const bytes = await file.arrayBuffer();
        buffer = Buffer.from(bytes);
        fileName = file.name || null;
        mimeType = file.type || null;
      }

      data = await pool.updateJd(params.id, {
        title: form.has('title') ? form.get('title')?.toString() : undefined,
        departmentName: form.has('department_name') ? (form.get('department_name')?.toString() || null) : undefined,
        description: form.has('description') ? (form.get('description')?.toString() || null) : undefined,
        status: form.has('status') ? form.get('status')?.toString() : undefined,
        fileName,
        mimeType,
        buffer,
      });
    } else {
      const body = await request.json();
      data = await pool.updateJd(params.id, {
        title: body.title,
        departmentName: body.department_name,
        description: body.description,
        status: body.status,
      });
    }

    if (!data) return NextResponse.json({ error: 'Khong tim thay JD' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/hr/jd/:id error:', err);
    return NextResponse.json({ error: 'Loi server' }, { status: 500 });
  }
}

export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Kho JD', '/nguon-nhan-luc/kho-mo-ta-cong-viec');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    const activeCompany = request.headers.get('x-current-user-company') || undefined;
    const ctx = userId ? await getEffectiveContext(userId, activeCompany) : null;
    const role = ctx?.role || '';
    if (!['super_admin', 'admin', 'manager'].includes(role) && !checkUnitAccess(request, 'hr-jd', 'delete')) {
      return NextResponse.json({ error: 'Khong co quyen' }, { status: 403 });
    }

    const ok = await pool.deleteJd(params.id);
    if (!ok) return NextResponse.json({ error: 'Khong tim thay JD' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/jd/:id error:', err);
    return NextResponse.json({ error: 'Loi server' }, { status: 500 });
  }
}
