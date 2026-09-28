import { NextRequest, NextResponse } from 'next/server';
import { checkUnitAccess } from '@/lib/api-permissions';
import { searchCvs, type CvSearchFilter } from '@/lib/services/hrPoolService';
import { parseCvAdvancedFilter } from '@/lib/cvFilters';

export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/cv/search — tìm ứng viên theo filter có cấu trúc.
 *
 * Đây là nền cho Phase 2 (bot AI/Telegram): câu hỏi ngôn ngữ tự nhiên →
 * LLM chuyển thành filter JSON → gọi endpoint này → trả ứng viên đã xếp hạng.
 *
 * Body (JSON, tất cả tuỳ chọn):
 * { keyword, status, skills[], anySkills[], minExperience, maxExperience,
 *   source, minRating, position, limit }
 */
export async function POST(request: NextRequest) {
  try {
    if (!checkUnitAccess(request, 'hr-cv', 'view')) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });
    }
    let body: CvSearchFilter;
    let advanced;
    try {
      body = await request.json();
      advanced = parseCvAdvancedFilter(body);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Bộ lọc không hợp lệ' }, { status: 400 });
    }
    const filter: CvSearchFilter = {
      ...advanced,
      keyword: typeof body.keyword === 'string' ? body.keyword : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      skills: Array.isArray(body.skills) ? body.skills.filter((s) => typeof s === 'string') : undefined,
      anySkills: Array.isArray(body.anySkills) ? body.anySkills.filter((s) => typeof s === 'string') : undefined,
      minExperience: typeof body.minExperience === 'number' ? body.minExperience : undefined,
      maxExperience: typeof body.maxExperience === 'number' ? body.maxExperience : undefined,
      source: typeof body.source === 'string' ? body.source : undefined,
      minRating: typeof body.minRating === 'number' ? body.minRating : undefined,
      position: typeof body.position === 'string' ? body.position : undefined,
      industry: typeof body.industry === 'string' ? body.industry : undefined,
      requisitionId: typeof body.requisitionId === 'string' ? body.requisitionId : undefined,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
    };
    const data = await searchCvs(filter, request.headers.get('x-current-user-id'));
    return NextResponse.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('POST /api/hr/cv/search error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
