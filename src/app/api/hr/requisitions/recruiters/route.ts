import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export interface Recruiter {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

/**
 * GET /api/hr/requisitions/recruiters
 * Trả về danh sách "Người phụ trách tuyển dụng" = user active được TICK quyền
 * "Duyệt" (approve) ở module "Tiếp Nhận Yêu Cầu Tuyển Dụng" (hr-requisitions).
 * Chỉ người có action 'approve' mới hiện — không phải mọi người có module này.
 */
export async function GET(_request: NextRequest) {
  try {
    const rows = await query<Recruiter>(
      `SELECT id::text AS id, name, email, avatar
         FROM users
        WHERE status = 'active'
          AND jsonb_typeof(module_permissions->'hr-requisitions') = 'array'
          AND module_permissions->'hr-requisitions' @> '["approve"]'::jsonb
        ORDER BY name ASC`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/hr/requisitions/recruiters error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
