import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getContractVisibility } from '@/lib/services/contractPermissionService';
import { getEvaluationVisibility } from '@/lib/services/evaluationPermissionService';
import { countPendingEvaluations } from '@/lib/services/evaluationService';

export const dynamic = 'force-dynamic';

export interface HrBadgeCounts {
  contracts: number;   // hợp đồng sắp hết hạn (≤30 ngày) + quá hạn
  evaluations: number; // đánh giá đang chờ xử lý
  docs: number;        // yêu cầu đổi hồ sơ chờ duyệt
}

/** GET /api/hr/badge-counts — đếm các mục cần chú ý cho từng tab */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');

    // Hợp đồng & Hồ sơ: phạm vi theo quyền hợp đồng (đúng miền của 2 tab đó).
    const visibility = await getContractVisibility(userId, activeCompany);
    const ids = visibility.all ? null : (visibility.allowedEmployeeIds ?? []);
    const contractsEmpty = ids !== null && ids.length === 0;

    // Đánh giá: PHẢI dùng phân quyền đánh giá + lọc công ty active — GIỐNG HỆT danh sách
    // ở tab (getEvaluationVisibility + companyId). Trước đây badge dùng getContractVisibility
    // và không lọc công ty → đếm 3 (xuyên công ty / sai miền) trong khi tab chỉ có 1 dòng.
    const evalVis = await getEvaluationVisibility(userId, activeCompany);

    // Super Admin toàn cục: badge đánh giá đếm TOÀN HỆ THỐNG (khớp danh sách ở tab, không
    // lọc công ty). Admin/Quản lý/User đếm theo công ty đang chọn.
    const roleRow = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [userId]);
    const evalCompanyId = roleRow?.role === 'super_admin' ? null : (activeCompany || null);

    const empParam = ids ? [ids] : [];
    const docsEmpFilter = ids ? `AND LOWER(d.employee_id) = ANY($1)` : '';

    const [contractRow, evaluations, docsRow] = await Promise.all([
      contractsEmpty ? Promise.resolve({ cnt: '0' }) : queryOne<{ cnt: string }>(`
        SELECT COUNT(*)::text AS cnt FROM contracts
        WHERE (status = 'draft'
           OR (status = 'active' AND end_date IS NOT NULL AND end_date <= NOW() + INTERVAL '30 days'))
        ${ids ? 'AND LOWER(employee_id) = ANY($1)' : ''}
      `, empParam),

      countPendingEvaluations({
        allowedEmployeeIds: evalVis.all ? undefined : (evalVis.allowedEmployeeIds ?? []),
        companyId: evalCompanyId,
      }),

      contractsEmpty ? Promise.resolve({ cnt: '0' }) : queryOne<{ cnt: string }>(`
        SELECT COUNT(*)::text AS cnt
        FROM hr_document_replace_requests r
        JOIN hr_documents d ON d.id = r.original_doc_id
        WHERE r.status = 'pending'
        ${docsEmpFilter}
      `, empParam),
    ]);

    const counts: HrBadgeCounts = {
      contracts:   parseInt(contractRow?.cnt || '0', 10),
      evaluations,
      docs:        parseInt(docsRow?.cnt || '0', 10),
    };

    return NextResponse.json({ success: true, data: counts });
  } catch (err) {
    console.error('GET /api/hr/badge-counts error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
