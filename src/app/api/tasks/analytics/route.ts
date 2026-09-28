import { NextRequest, NextResponse } from 'next/server';
import { getAnalyticsDashboard } from '@/lib/services/taskAnalyticsService';

/**
 * GET /api/tasks/analytics
 * Lấy toàn bộ dashboard analytics cho tasks.
 */
export async function GET(_request: NextRequest) {
  try {
    const data = await getAnalyticsDashboard();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/tasks/analytics error:', error);
    return NextResponse.json({ error: 'Lỗi lấy thống kê tasks' }, { status: 500 });
  }
}
