import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkUnitAccess } from '@/lib/api-permissions';
import { getMachineById } from '@/lib/services/machineService';

/**
 * GET /api/attendance/machines/[id]/records
 * Lấy punch của 1 máy từ device_punches (Projection Model).
 * mapped   = punch đã có mapping (kèm tên user)
 * unmapped = punch chưa có mapping
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const machineId = params.id;
    if (!checkUnitAccess(request, 'cham-cong-machines', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    const role = request.headers.get('x-current-user-role') || '';
    const companyId = request.headers.get('x-current-user-company');
    if (
      role !== 'super_admin' &&
      (!companyId || !(await getMachineById(machineId, companyId)))
    ) {
      return NextResponse.json({ error: 'Máy không thuộc công ty hiện tại' }, { status: 403 });
    }
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
    const offset = (page - 1) * limit;
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');

    // Build điều kiện thời gian động
    const cond: string[] = ['dp.machine_id = $1'];
    const args: any[] = [machineId];
    if (startDate) { args.push(startDate); cond.push(`dp.punch_time >= $${args.length}`); }
    if (endDate)   { args.push(endDate);   cond.push(`dp.punch_time <= $${args.length}`); }
    const where = cond.join(' AND ');

    // Phân trang NGAY trong SQL (LIMIT/OFFSET) + COUNT(*) OVER() lấy tổng —
    // tránh kéo toàn bộ punch của máy về rồi slice trong JS (chậm khi vài chục nghìn dòng).
    args.push(limit);  const limitIdx  = args.length;
    args.push(offset); const offsetIdx = args.length;

    const rows = await query<any>(
      `SELECT
         dp.id,
         m.user_id,
         u.name  AS user_name,
         u.email AS user_email,
         dp.punch_time AS recorded_at,
         dp.employee_code,
         dp.created_at,
         CASE WHEN m.user_id IS NULL THEN 'unmapped' ELSE 'mapped' END AS record_type,
         COUNT(*) OVER() AS total_count
       FROM device_punches dp
       LEFT JOIN attendance_machine_mappings m
         ON m.machine_id = dp.machine_id AND m.employee_code = dp.employee_code
         AND dp.punch_time >= m.effective_from
         AND (m.effective_to IS NULL OR dp.punch_time < m.effective_to)
       LEFT JOIN users u ON u.id::text = m.user_id::text
       WHERE ${where}
       ORDER BY dp.punch_time DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      args
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
    const data = rows.map(({ total_count, ...r }) => r);

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('GET /api/attendance/machines/[id]/records error:', err);
    return NextResponse.json({ error: 'Lỗi khi lấy records' }, { status: 500 });
  }
}
