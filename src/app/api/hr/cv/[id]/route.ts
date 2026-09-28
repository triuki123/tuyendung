import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';
import { parseCvCandidateCriteria } from '@/lib/cvFilters';

export const dynamic = 'force-dynamic';

function sniffMime(content: Buffer, fallback: string | null): string {
  if (content.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (content.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return fallback || 'application/octet-stream';
}

/** GET /api/hr/cv/:id — tải file CV */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const doc = await pool.getCvContent(params.id);
    if (!doc) return NextResponse.json({ error: 'Không tìm thấy tệp' }, { status: 404 });
    return new NextResponse(doc.content as any, {
      headers: {
        'Content-Type': sniffMime(doc.content, doc.mime_type),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
      },
    });
  } catch (err) {
    console.error('GET /api/hr/cv/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** PUT /api/hr/cv/:id — cập nhật metadata/trạng thái CV */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const PUT = withRecruitmentUpdate(PUTHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function PUTHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'edit')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const body = await request.json();
    let criteria;
    try { criteria = parseCvCandidateCriteria(body); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Thông tin không hợp lệ' }, { status: 400 }); }
    const data = await pool.updateCv(params.id, {
      ...criteria,
      changedBy: request.headers.get('x-current-user-id'),
      candidateName: body.candidate_name,
      candidateEmail: body.candidate_email,
      candidatePhone: body.candidate_phone,
      positionApplied: body.position_applied,
      industry: body.industry,
      source: body.source,
      status: body.status,
      note: body.note,
      skills: Array.isArray(body.skills) ? body.skills : undefined,
      yearsExperience: body.years_experience,
      currentTitle: body.current_title,
      educationLevel: body.education_level,
      expectedSalary: body.expected_salary,
      location: body.location,
      languages: Array.isArray(body.languages) ? body.languages : undefined,
      rating: body.rating,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
    });
    if (!data) return NextResponse.json({ error: 'Không tìm thấy CV' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('PUT /api/hr/cv/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/** DELETE /api/hr/cv/:id — xóa CV (soft delete) */
export const DELETE = withRecruitmentUpdate(DELETEHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function DELETEHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'delete')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const ok = await pool.deleteCv(params.id);
    if (!ok) return NextResponse.json({ error: 'Không tìm thấy CV' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/hr/cv/:id error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
