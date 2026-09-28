import { NextRequest, NextResponse } from 'next/server';
import { getProjectsForUser, createProject, ProjectCreateInput } from '@/lib/services/projectService';
import { requireCompanyContext } from '@/lib/apiAuth';

/**
 * GET /api/projects
 * Danh sách dự án theo CÔNG TY ĐANG LÀM VIỆC (không tin company_id từ query).
 * requireCompanyContext đã đảm bảo user thuộc công ty active.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireCompanyContext(request);
    if ('response' in ctx) return ctx.response;
    const { context } = ctx;

    const projects = await getProjectsForUser(context.user_id, context.company_id || undefined);
    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

/**
 * POST /api/projects
 * Tạo dự án — company_id LUÔN theo công ty đang làm việc (không tin body),
 * để không thể tạo dự án sang công ty khác. Cần quyền Manager trở lên.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireCompanyContext(request);
    if ('response' in ctx) return ctx.response;
    const { context } = ctx;

    if (!context.company_id) {
      return NextResponse.json({ error: 'Chưa chọn công ty làm việc' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, start_date, end_date, budget_amount } = body;

    if (!name) {
      return NextResponse.json({ error: 'Thiếu tên dự án' }, { status: 400 });
    }

    const projectData: ProjectCreateInput = {
      name,
      description,
      company_id: context.company_id, // ép theo công ty active
      start_date,
      end_date,
      budget_amount,
    };

    const project = await createProject(context.user_id, projectData);
    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Permission denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('POST /api/projects error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
