import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getEffectiveContext } from '@/lib/services/userCompanyService';
import { queryOne } from '@/lib/db';
import { createJdPdf } from '@/lib/services/jdPdf';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id') || '';
    const ctx = userId ? await getEffectiveContext(userId, request.headers.get('x-current-user-company') || undefined) : null;
    if (!['super_admin','admin','manager'].includes(ctx?.role || '') && !checkUnitAccess(request, 'hr-jd', 'view')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    const jd = await queryOne<{ title: string; description: string | null; department_name: string | null }>('SELECT title, description, department_name FROM hr_jd_pool WHERE id=$1 AND deleted_at IS NULL', [params.id]);
    if (!jd) return NextResponse.json({ error: 'Không tìm thấy JD' }, { status: 404 });
    const bytes = await createJdPdf(jd);
    return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`JD - ${jd.title}.pdf`)}`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Export JD PDF:', error);
    return NextResponse.json({ error: 'Không xuất được PDF. Vui lòng thử lại.' }, { status: 500 });
  }
}
