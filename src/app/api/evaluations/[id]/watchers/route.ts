import { NextRequest, NextResponse } from 'next/server';
import { listWatchers, addWatcher, removeWatcher } from '@/lib/services/evaluationWatcherService';
import { getEvaluationById } from '@/lib/services/evaluationService';
import { canManageEvaluations, canViewEmployeeEvaluation } from '@/lib/services/evaluationPermissionService';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');

    const ev = await getEvaluationById(params.id);
    if (!ev) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });

    const canView = await canViewEmployeeEvaluation(userId, ev.employee_id, activeCompany);
    if (!canView) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const data = await listWatchers(params.id);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('GET /api/evaluations/[id]/watchers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');

    const canEdit = await canManageEvaluations(userId, 'edit', activeCompany);
    if (!canEdit) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const body = await request.json();
    if (!body.user_id) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 });

    const watcher = await addWatcher(params.id, body.user_id, userId);
    return NextResponse.json({ success: true, data: watcher }, { status: 201 });
  } catch (err) {
    console.error('POST /api/evaluations/[id]/watchers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = request.headers.get('x-current-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const activeCompany = request.headers.get('x-current-user-company');

    const canEdit = await canManageEvaluations(userId, 'edit', activeCompany);
    if (!canEdit) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const body = await request.json();
    if (!body.user_id) return NextResponse.json({ error: 'Thiếu user_id' }, { status: 400 });

    const removed = await removeWatcher(params.id, body.user_id);
    if (!removed) return NextResponse.json({ error: 'Không tìm thấy watcher' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/evaluations/[id]/watchers error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
