import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { markCvViewed } from '@/lib/services/hrPoolService';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!checkUnitAccess(request, 'hr-cv', 'view')) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
  const viewerId = request.headers.get('x-current-user-id');
  if (!viewerId) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 });
  try {
    if (!await markCvViewed(params.id, viewerId)) return NextResponse.json({ error: 'Không tìm thấy CV' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) { console.error('CV view:', error); return NextResponse.json({ error: 'Không lưu được lịch sử xem' }, { status: 500 }); }
}
