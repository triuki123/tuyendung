import { NextRequest, NextResponse } from 'next/server';
import * as svc from '@/lib/services/leaveBalanceService';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET — thống kê phép năm của 1 user: ?year=2026&userId=...
 * Mặc định xem của chính mình; admin hoặc Quản Lý Trực Tiếp xem được người khác.
 * ?transactions=true → kèm lịch sử giao dịch quỹ.
 */
export async function GET(request: NextRequest) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const role = request.headers.get('x-current-user-role');
    if (!currentUserId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year')
      ? parseInt(searchParams.get('year')!)
      : new Date().getFullYear();
    const targetUserId = searchParams.get('userId') || currentUserId;
    const withTransactions = searchParams.get('transactions') === 'true';

    if (targetUserId !== currentUserId) {
      const isAdmin = role === 'super_admin' || role === 'admin';
      if (!isAdmin) {
        const target = await queryOne<{ manager_id: string | null }>(
          `SELECT manager_id FROM users WHERE id::text = $1`,
          [targetUserId]
        );
        if (target?.manager_id !== currentUserId) {
          return NextResponse.json({ error: 'Không có quyền xem' }, { status: 403 });
        }
      }
    }

    const stats = await svc.getYearStats(targetUserId, year);
    const transactions = withTransactions
      ? await svc.getTransactions(targetUserId, year)
      : undefined;

    return NextResponse.json({ success: true, data: { year, ...stats, transactions } });
  } catch (err) {
    console.error('GET /api/leave/balance error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
