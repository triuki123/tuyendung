import { NextRequest, NextResponse } from 'next/server';
import { getAssignees, addAssignee, removeAssignee } from '@/lib/services/taskAssigneeService';
import { notifyCoAssigneeAdded } from '@/lib/services/taskNotifications';
import { queryOne } from '@/lib/db';

/**
 * GET /api/tasks/{id}/assignees
 * Get all additional assignees for a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const taskId = params.id;
    const assignees = await getAssignees(taskId);

    return NextResponse.json({ success: true, data: assignees });
  } catch (error) {
    console.error('GET /api/tasks/{id}/assignees error:', error);
    return NextResponse.json({ error: 'Failed to fetch assignees' }, { status: 500 });
  }
}

/**
 * POST /api/tasks/{id}/assignees
 * Add an additional assignee to a task
 * Body: { user_id: string, role?: 'assignee' | 'reviewer' | 'approver' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const taskId = params.id;
    const body = await request.json();
    const { user_id, role } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    const assignee = await addAssignee(
      taskId,
      currentUserId,
      { user_id, role: role || 'assignee' }
    );

    // Thông báo cho người vừa được thêm làm đồng phụ trách
    try {
      const [task, actor] = await Promise.all([
        queryOne<any>(
          'SELECT id, code, task_code, title, priority, due_date, assigned_to, created_by FROM tasks WHERE id = $1',
          [taskId]
        ),
        queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [currentUserId]),
      ]);
      if (task) {
        await notifyCoAssigneeAdded(
          task, user_id, currentUserId, actor?.name || 'Người dùng'
        ).catch((err) => console.error('[notifyCoAssigneeAdded] error:', err));
      }
    } catch (err) {
      console.error('Co-assignee notification error:', err);
    }

    return NextResponse.json({ success: true, data: assignee }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Permission denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message.includes('already assigned')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }
    console.error('POST /api/tasks/{id}/assignees error:', error);
    return NextResponse.json({ error: 'Failed to add assignee' }, { status: 500 });
  }
}
