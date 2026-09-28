import { NextRequest, NextResponse } from 'next/server';
import { listEvaluations, createEvaluation } from '@/lib/services/evaluationService';
import { getEvaluationVisibility, canManageEvaluations } from '@/lib/services/evaluationPermissionService';
import { notifyEmployeeEvaluationCreated } from '@/lib/services/evaluationWatcherService';
import { logHrRecord } from '@/lib/services/hrAuditService';
import { queryOne } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const { searchParams } = new URL(request.url);
    const vis = await getEvaluationVisibility(userId, activeCompany);

    // Super Admin (vai TOÀN CỤC, không phải vai hiệu lực theo công ty) thấy đánh giá của
    // MỌI công ty dù đang đứng ở công ty nào — KHÔNG lọc theo công ty. Admin/Quản lý/User
    // vẫn khoá theo công ty đang chọn.
    const roleRow = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [userId]);
    const isGlobalSuperAdmin = roleRow?.role === 'super_admin';

    const filter: Record<string, any> = {};
    if (!vis.all) filter.allowedEmployeeIds = vis.allowedEmployeeIds;
    // Scope theo công ty active — TRỪ super_admin toàn cục (thấy toàn hệ thống).
    if (activeCompany && !isGlobalSuperAdmin) filter.companyId = activeCompany;
    if (searchParams.get('employee_id')) filter.employee_id = searchParams.get('employee_id');
    if (searchParams.get('status')) filter.status = searchParams.get('status');
    if (searchParams.get('employment_type_id')) filter.employment_type_id = searchParams.get('employment_type_id');
    // archive=active (mặc định ẩn đã lưu trữ) · archived (chỉ đã lưu trữ) · all
    const arch = searchParams.get('archive');
    if (arch === 'archived' || arch === 'all') filter.archiveScope = arch;

    const data = await listEvaluations(filter);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/evaluations error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

    const activeCompany = request.headers.get('x-current-user-company');
    const canCreate = await canManageEvaluations(userId, 'create', activeCompany);
    if (!canCreate) return NextResponse.json({ error: 'Không có quyền tạo đánh giá' }, { status: 403 });

    const body = await request.json();
    if (!body.employee_id) return NextResponse.json({ error: 'Thiếu employee_id' }, { status: 400 });

    const evaluation = await createEvaluation({
      employee_id: body.employee_id,
      employment_type_id: body.employment_type_id ?? null,
      employment_type_name: body.employment_type_name ?? null,
      hire_date: body.hire_date ?? null,
      probation_end_date: body.probation_end_date ?? null,
      status: body.status ?? 'pending_signing',
      auto_generated: false,
      created_by: userId,
    });

    await logHrRecord({
      entityType: 'evaluation', entityId: evaluation.id, action: 'create',
      details: `Tạo đánh giá${body.employment_type_name ? ` (${body.employment_type_name})` : ''}`,
      performedBy: userId,
    });

    // Notify nhân viên
    notifyEmployeeEvaluationCreated(evaluation.id, body.employee_id, body.employment_type_name).catch(() => {});

    return NextResponse.json({ success: true, data: evaluation }, { status: 201 });
  } catch (err) {
    console.error('POST /api/evaluations error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
