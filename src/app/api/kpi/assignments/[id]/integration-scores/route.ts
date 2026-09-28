import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { resolveKpiScope } from '@/lib/services/kpiCompanyContext';
import { getEnabledIntegrationScores } from '@/lib/services/kpiIntegrationService';

export const dynamic = 'force-dynamic';

/**
 * GET — điểm từ các nguồn tích hợp ĐANG BẬT (Chấm công/Task) ở BỘ CHỈ TIÊU của phiếu này,
 * trong đúng khoảng thời gian của kỳ, để cấp cao tham khảo khi chốt điểm. Nguồn nào bộ chỉ
 * tiêu CHƯA bật sẽ không xuất hiện ở đây; phiếu không dùng mẫu thì không có gì để tham khảo.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const ctx = await resolveKpiScope(request, userId, request.nextUrl.searchParams.get('company_id'));
    if (!ctx?.company_id) return NextResponse.json({ error: 'Không xác định được công ty' }, { status: 400 });

    const a = await queryOne<{ employee_id: string; cycle_id: string; template_id: string | null }>(
      `SELECT employee_id, cycle_id, template_id FROM kpi_assignments WHERE id = $1 AND company_id = $2`,
      [params.id, ctx.company_id]
    );
    if (!a) return NextResponse.json({ error: 'Không tìm thấy phiếu KPI' }, { status: 404 });
    if (!a.template_id) return NextResponse.json({ success: true, data: [] });

    const [cycle, template] = await Promise.all([
      queryOne<{ start_date: string; end_date: string }>(`SELECT start_date, end_date FROM kpi_cycles WHERE id = $1`, [a.cycle_id]),
      queryOne<{ integration_sources: any[] }>(`SELECT integration_sources FROM kpi_templates WHERE id = $1`, [a.template_id]),
    ]);
    if (!cycle) return NextResponse.json({ error: 'Không tìm thấy kỳ đánh giá' }, { status: 404 });

    const data = await getEnabledIntegrationScores(template?.integration_sources || [], a.employee_id, cycle.start_date, cycle.end_date);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/kpi/assignments/[id]/integration-scores error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
