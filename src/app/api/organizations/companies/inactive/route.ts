import { NextRequest, NextResponse } from 'next/server';
import { companiesService } from '@/lib/services/companiesService';
import { getVisibleCompanyIds } from '@/lib/services/userCompanyService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Công ty đã ẩn (kèm số liệu) là dữ liệu toàn hệ thống → CHỈ super_admin.
    const allowed = await getVisibleCompanyIds(request.headers.get('x-current-user-id'));
    if (allowed !== null) {
      return NextResponse.json({ success: true, data: [] });
    }

    const data = await companiesService.getInactiveWithCounts();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/organizations/companies/inactive error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
