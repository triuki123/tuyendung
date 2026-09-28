import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import * as pool from '@/lib/services/hrPoolService';
import { parseCvCandidateCriteria } from '@/lib/cvFilters';
import { CV_IMPORT_FIELDS } from '@/lib/cvImport';
import type { CvImportField } from '@/lib/cvImport';

export const dynamic = 'force-dynamic';

/** Tách chuỗi "a, b; c" → ['a','b','c']. */
function parseList(v: FormDataEntryValue | null): string[] {
  if (typeof v !== 'string' || !v.trim()) return [];
  return v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function parseNum(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number(v.replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

/** GET /api/hr/cv — danh sách CV trong kho. Query: ?status= */
export async function GET(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const data = await pool.listCvs(status, request.headers.get('x-current-user-id'));
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/hr/cv error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/hr/cv — thêm CV (multipart/form-data)
 * Trường: candidate_name, candidate_email?, candidate_phone?, position_applied?, source?, note?, file?
 */
import { withRecruitmentUpdate } from '@/lib/notifications/recruitmentUpdates';
export const POST = withRecruitmentUpdate(POSTHandler, 'Kho ứng viên', '/nguon-nhan-luc/kho-ung-vien');
async function POSTHandler(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'create')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const userId = request.headers.get('x-current-user-id');
    const form = await request.formData();
    let criteria;
    try { criteria = parseCvCandidateCriteria(Object.fromEntries(form.entries())); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Thông tin không hợp lệ' }, { status: 400 }); }
    const candidateName = (form.get('candidate_name') as string)?.trim();
    let manualFields: CvImportField[] = [];
    try {
      const raw = JSON.parse(typeof form.get('manual_fields') === 'string' ? form.get('manual_fields') as string : '[]');
      if (!Array.isArray(raw) || raw.length > Object.keys(CV_IMPORT_FIELDS).length || raw.some(key => typeof key !== 'string' || !(key in CV_IMPORT_FIELDS))) throw new Error();
      manualFields = raw;
    } catch { return NextResponse.json({ error: 'Danh sách trường nhập tay không hợp lệ' }, { status: 400 }); }
    const industryMode = form.get('industry_mode');
    if (industryMode != null && industryMode !== 'auto' && industryMode !== 'manual') return NextResponse.json({ error: 'Chế độ phân loại ngành nghề không hợp lệ' }, { status: 400 });
    const file = form.get('file');
    let buffer: Buffer | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    if (file instanceof File && file.size > 0) {
      if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Tệp CV tối đa 20MB' }, { status: 400 });
      buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name;
      mimeType = file.type || undefined;
    }
    if (!candidateName && !buffer) return NextResponse.json({ error: 'Thiếu tên ứng viên hoặc tệp CV' }, { status: 400 });
    const skills = parseList(form.get('skills'));
    const data = await pool.createCv({
      ...criteria,
      candidateName,
      manualFields, industryMode: industryMode || undefined,
      candidateEmail: (form.get('candidate_email') as string) || undefined,
      candidatePhone: (form.get('candidate_phone') as string) || undefined,
      positionApplied: (form.get('position_applied') as string) || undefined,
      industry: (form.get('industry') as string) || undefined,
      source: (form.get('source') as string) || undefined,
      note: (form.get('note') as string) || undefined,
      fileName,
      mimeType,
      buffer,
      uploadedBy: userId,
      skills: skills.length ? skills : undefined,
      yearsExperience: parseNum(form.get('years_experience')),
      currentTitle: (form.get('current_title') as string) || undefined,
      educationLevel: (form.get('education_level') as string) || undefined,
      expectedSalary: parseNum(form.get('expected_salary')),
      location: (form.get('location') as string) || undefined,
      languages: parseList(form.get('languages')),
      tags: parseList(form.get('tags')),
    });

    return NextResponse.json({ success: true, data, duplicates: [] });
  } catch (err) {
    console.error('POST /api/hr/cv error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi server', ...(err instanceof pool.DuplicateCvError ? { code: 'DUPLICATE_CV' } : {}) },
      { status: err instanceof pool.DuplicateCvError ? 409 : err instanceof Error && /Chưa nhận diện được tên/.test(err.message) ? 400 : 500 }
    );
  }
}
