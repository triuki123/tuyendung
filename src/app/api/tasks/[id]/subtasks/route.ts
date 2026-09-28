import { NextRequest, NextResponse } from 'next/server';
import {
  createSubtask,
  getSubtasks,
  getSubtaskCompletion,
} from '@/lib/services/taskSubtaskService';
import { canEditTask } from '@/lib/services/taskPermissionService';
import { notifyTaskSubtaskAdded } from '@/lib/services/taskNotifications';
import { queryOne } from '@/lib/db';

/**
 * GET /api/tasks/[id]/subtasks
 * Get all subtasks for a task
 *
 * Query parameters:
 * - include_archived: boolean (default: false)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('include_archived') === 'true';

    const subtasks = await getSubtasks(params.id, includeArchived);
    const completion = await getSubtaskCompletion(params.id);

    return NextResponse.json({
      success: true,
      data: subtasks,
      completion,
    });
  } catch (error) {
    console.error(`GET /api/tasks/[id]/subtasks error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch subtasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/subtasks
 * Create a new subtask
 *
 * Request body:
 * {
 *   title: string (required)
 *   description?: string
 *   assigned_to?: string (user ID)
 *   assigned_to_name?: string
 *   due_date?: string (ISO date)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.title || body.title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Tiêu đề subtask là bắt buộc' },
        { status: 400 }
      );
    }

    // 🔐 CHECK PERMISSION: Can user edit the task?
    const editPerm = await canEditTask(currentUserId, params.id);
    if (!editPerm.allowed) {
      console.warn(
        `Permission denied to add subtask: ${currentUserId} -> ${params.id}`
      );
      return NextResponse.json(
        {
          error:
            editPerm.reason || 'Không có quyền thêm subtask vào task này',
        },
        { status: 403 }
      );
    }

    // Create subtask
    const subtask = await createSubtask(params.id, currentUserId, {
      title: body.title.trim(),
      description: body.description,
      assigned_to: body.assigned_to,
      assigned_to_name: body.assigned_to_name,
      due_date: body.due_date,
    });

    console.log(
      `Subtask created by ${currentUserId} on task ${params.id}: ${subtask.id}`
    );

    // Thông báo cho assignees (primary + co-assignees + creator), trừ chính người vừa thêm.
    try {
      const [task, actor] = await Promise.all([
        queryOne<any>(
          'SELECT id, code, task_code, title, assigned_to, created_by FROM tasks WHERE id = $1',
          [params.id]
        ),
        queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [currentUserId]),
      ]);
      if (task) {
        await notifyTaskSubtaskAdded(
          task,
          subtask.title,
          currentUserId,
          actor?.name || 'Người dùng'
        ).catch((err) => console.error('[notifyTaskSubtaskAdded] error:', err));
      }
    } catch (err) {
      console.error('Subtask notification error:', err);
    }

    return NextResponse.json({
      success: true,
      data: subtask,
    });
  } catch (error) {
    console.error(`POST /api/tasks/[id]/subtasks error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create subtask' },
      { status: 500 }
    );
  }
}
