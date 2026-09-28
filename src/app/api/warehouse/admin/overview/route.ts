import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireWarehousePermission } from '@/lib/warehouse/adminGuard';
import { getManagedWarehouses } from '@/lib/services/warehouseService';
import { vnToday } from '@/lib/services/warehouseAttendanceService';

export const dynamic = 'force-dynamic';

/**
 * GET: tổng quan các kho user quản lý — cho trang Kho / Xưởng trong app chính.
 * Mỗi kho: công nhân đang làm, đã check-in hôm nay, quên check-out hôm qua,
 * sản lượng hôm qua, đơn chờ duyệt.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireWarehousePermission(request, 'view');
    if ('response' in guard) return guard.response;
    const warehouses = await getManagedWarehouses(guard.actor.id, guard.actor.role);
    if (warehouses.length === 0) {
      return NextResponse.json({ success: true, data: [], role: guard.actor.role });
    }
    const ids = warehouses.map((w) => w.id);
    const today = vnToday();
    const yesterday = new Date(new Date(today + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);

    const [workers, checkins, missing, output, pending] = await Promise.all([
      query(
        `SELECT warehouse_id, COUNT(*)::int AS n FROM warehouse_workers
         WHERE warehouse_id = ANY($1) AND status = 'active' GROUP BY warehouse_id`, [ids]
      ),
      query(
        `SELECT warehouse_id, COUNT(*)::int AS n FROM warehouse_attendance
         WHERE warehouse_id = ANY($1) AND work_date = $2 AND check_in_at IS NOT NULL GROUP BY warehouse_id`,
        [ids, today]
      ),
      query(
        `SELECT warehouse_id, COUNT(*)::int AS n FROM warehouse_attendance
         WHERE warehouse_id = ANY($1) AND work_date = $2 AND check_in_at IS NOT NULL AND check_out_at IS NULL
         GROUP BY warehouse_id`,
        [ids, yesterday]
      ),
      query(
        `SELECT o.warehouse_id, p.name, p.unit, SUM(o.quantity) AS qty
         FROM warehouse_output o JOIN warehouse_products p ON p.id = o.product_id
         WHERE o.warehouse_id = ANY($1) AND o.work_date = $2
         GROUP BY o.warehouse_id, p.name, p.unit`,
        [ids, yesterday]
      ),
      query(
        `SELECT warehouse_id, SUM(n)::int AS n FROM (
           SELECT warehouse_id, COUNT(*) AS n FROM warehouse_leave_requests
             WHERE warehouse_id = ANY($1) AND status = 'pending' GROUP BY warehouse_id
           UNION ALL
           SELECT warehouse_id, COUNT(*) AS n FROM warehouse_advances
             WHERE warehouse_id = ANY($1) AND status = 'pending' GROUP BY warehouse_id
         ) t GROUP BY warehouse_id`,
        [ids]
      ),
    ]);

    const by = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.warehouse_id, r]));
    const workersBy = by(workers), checkinsBy = by(checkins), missingBy = by(missing), pendingBy = by(pending);
    const outputBy: Record<string, any[]> = {};
    for (const r of output) (outputBy[r.warehouse_id] ||= []).push(r);

    const data = warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      code: w.code,
      company_name: w.company_name || null,
      active_workers: workersBy[w.id]?.n ?? 0,
      checked_in_today: checkinsBy[w.id]?.n ?? 0,
      missing_checkout_yesterday: missingBy[w.id]?.n ?? 0,
      pending_requests: pendingBy[w.id]?.n ?? 0,
      output_yesterday: (outputBy[w.id] || []).map((o) => ({ name: o.name, unit: o.unit, qty: Number(o.qty) })),
    }));
    return NextResponse.json({ success: true, data, role: guard.actor.role, today, yesterday });
  } catch (err) {
    console.error('GET /api/warehouse/admin/overview error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
