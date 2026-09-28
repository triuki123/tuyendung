import { NextRequest, NextResponse } from 'next/server';
import * as assetLookupService from '@/lib/services/assetLookupService';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    const role = request.headers.get('x-current-user-role');

    if (!userId) {
      return NextResponse.json({ error: 'Chưa xác thực' }, { status: 401 });
    }

    const { mine, others, scope } = await assetLookupService.getVisibleAssets(userId, role);

    return NextResponse.json({
      success: true,
      data: { mine, others, scope },
    });
  } catch (err) {
    console.error('GET /api/asset-lookup error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
