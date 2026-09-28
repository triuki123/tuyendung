import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getCvFilterOptions } from '@/lib/services/hrPoolService';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!checkUnitAccess(request, 'hr-cv', 'view')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  try { return NextResponse.json({ success: true, data: await getCvFilterOptions() }); }
  catch (error) { console.error('CV filter options:', error); return NextResponse.json({ error: 'Không tải được tiêu chí lọc' }, { status: 500 }); }
}
