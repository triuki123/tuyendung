import { queryOne, execute, query } from '@/lib/db';
import {
  notifyTaskCreated,
  notifyTaskStatusChanged,
} from '@/lib/services/taskNotifications';
import {
  canEditTask,
  canDeleteTask,
  canUpdateTaskStatus,
  canReassignTask,
  canArchiveTask,
} from '@/lib/services/taskPermissionService';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveContext } from '@/lib/services/userCompanyService';

/**
 * GET /api/tasks/[id]
 * Fetch single task (uses canViewTask internally via GET /api/tasks)
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const effectiveContext = await getEffectiveContext(currentUserId, currentUserCompany || null);
    if (!effectiveContext) {
      return NextResponse.json(
        { error: 'User context not found' },
        { status: 404 }
      );
    }

    const task = await queryOne<any>(
      'SELECT * FROM tasks WHERE id = $1',
      [params.id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (effectiveContext.role === 'admin' && effectiveContext.company_id && task.company_id !== effectiveContext.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Đính kèm danh sách đồng phụ trách cho UI hiển thị.
    const coAssignees = await query<{ user_id: string; user_name: string | null; role: string }>(
      `SELECT ta.user_id, u.name AS user_name, ta.role
         FROM task_assignees ta
         LEFT JOIN users u ON u.id = ta.user_id
        WHERE ta.task_id = $1
        ORDER BY ta.created_at ASC`,
      [params.id]
    );

    return NextResponse.json({
      success: true,
      data: { ...task, co_assignees: coAssignees },
    });
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tasks/[id]
 * Update task with permission validation
 *
 * Validates permissions for:
 * - Editing task details (title, description, due_date, etc.)
 * - Changing status (requires special permission check)
 * - Reassigning task (requires special permission check)
 *
 * Request body: any fields to update
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const effectiveContext = await getEffectiveContext(currentUserId, currentUserCompany || null);
    if (!effectiveContext) {
      return NextResponse.json(
        { error: 'User context not found' },
        { status: 404 }
      );
    }

    // Fetch existing task
    const existingTask = await queryOne<any>(
      'SELECT * FROM tasks WHERE id = $1',
      [params.id]
    );
    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (effectiveContext.role === 'admin' && effectiveContext.company_id && existingTask.company_id !== effectiveContext.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 🔐 CHECK PERMISSION: Can user edit this task?
    const editPerm = await canEditTask(currentUserId, params.id);
    if (!editPerm.allowed) {
      console.warn(`Edit permission denied for user ${currentUserId}: ${editPerm.reason}`);
      return NextResponse.json(
        { error: editPerm.reason || 'Không có quyền chỉnh sửa task' },
        { status: 403 }
      );
    }

    // If status is being changed, do extra permission check
    if (body.status && body.status !== existingTask.status) {
      const statusPerm = await canUpdateTaskStatus(currentUserId, params.id, body.status);
      if (!statusPerm.allowed) {
        return NextResponse.json(
          { error: statusPerm.reason || 'Không có quyền thay đổi trạng thái' },
          { status: 403 }
        );
      }
    }

    // If reassigning task, check reassign permission
    if (body.assigned_to && body.assigned_to !== existingTask.assigned_to) {
      const reassignPerm = await canReassignTask(currentUserId, params.id, body.assigned_to);
      if (!reassignPerm.allowed) {
        return NextResponse.json(
          { error: reassignPerm.reason || 'Không có quyền giao lại task' },
          { status: 403 }
        );
      }
    }

    // 🔐 If archiving/unarchiving task, check archive permission
    if (body.archived_at !== undefined && body.archived_at !== existingTask.archived_at) {
      const archivePerm = await canArchiveTask(currentUserId, params.id);
      if (!archivePerm.allowed) {
        console.warn(`Archive permission denied for user ${currentUserId}: ${archivePerm.reason}`);
        return NextResponse.json(
          { error: archivePerm.reason || 'Không có quyền lưu trữ/khôi phục task' },
          { status: 403 }
        );
      }
    }

    // Only allow specific fields to be updated
    const allowedFields = [
      'title', 'description', 'priority', 'status',
      'assigned_to', 'assigned_to_name', 'due_date',
      'related_asset', 'code', 'task_code', 'archived_at',
      'ticket_id',
    ];

    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }
    updateData.updated_at = new Date().toISOString();

    // Build update SQL
    const cols = Object.keys(updateData);
    const vals = Object.values(updateData);
    const assignments = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const sql = `UPDATE tasks SET ${assignments} WHERE id = $${cols.length + 1} RETURNING *`;

    const responseData = await queryOne<any>(sql, [...vals, params.id]);

    if (!responseData) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Lấy tên người vừa thực hiện hành động (dùng cho cả 2 loại thông báo dưới)
    const actor = await queryOne<{ name: string }>(
      'SELECT name FROM users WHERE id = $1',
      [currentUserId]
    );
    const actorName = actor?.name || 'Hệ thống';

    // Đổi trạng thái → notify primary + co-assignees + creator (trừ actor)
    if (existingTask.status !== responseData.status) {
      await notifyTaskStatusChanged(
        responseData, existingTask.status, currentUserId, actorName
      ).catch((err) => console.error('Error sending status notification:', err));
    }

    // Đổi primary assignee → coi như tạo lại quyền sở hữu: notify như tạo task
    // (in-app + Telegram). Helper tự lấy luôn co-assignees hiện tại.
    if (existingTask.assigned_to !== responseData.assigned_to) {
      await notifyTaskCreated(
        { ...responseData, created_by_name: actorName },
        currentUserId
      ).catch((err) => console.error('Error sending assignment notification:', err));
    }

    console.log(`Task updated by ${currentUserId}: ${params.id}`);

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('PUT /api/tasks/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update task' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]
 * Delete task with permission validation
 *
 * Permission rules:
 * - Task creator can delete their own tasks (if not assigned)
 * - Manager can delete subordinate's tasks
 * - Higher rank can delete lower rank's tasks
 * - Super admin can delete anything
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    const currentUserCompany = request.headers.get('x-current-user-company');

    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const effectiveContext = await getEffectiveContext(currentUserId, currentUserCompany || null);
    if (!effectiveContext) {
      return NextResponse.json(
        { error: 'User context not found' },
        { status: 404 }
      );
    }

    // Fetch task before deletion
    const task = await queryOne<any>(
      'SELECT * FROM tasks WHERE id = $1',
      [params.id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (effectiveContext.role === 'admin' && effectiveContext.company_id && task.company_id !== effectiveContext.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 🔐 CHECK PERMISSION: Can user delete this task?
    const deletePerm = await canDeleteTask(currentUserId, params.id);
    if (!deletePerm.allowed) {
      console.warn(`Delete permission denied for user ${currentUserId}: ${deletePerm.reason}`);
      return NextResponse.json(
        { error: deletePerm.reason || 'Không có quyền xóa task' },
        { status: 403 }
      );
    }

    // Perform deletion
    const rowCount = await execute('DELETE FROM tasks WHERE id = $1', [params.id]);

    if (rowCount === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    console.log(`Task deleted by ${currentUserId}: ${params.id}`);

    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully',
      deletedTaskId: params.id,
    });
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete task' },
      { status: 500 }
    );
  }
}
