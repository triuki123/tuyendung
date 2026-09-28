import { NextRequest, NextResponse } from 'next/server';
import {
  getSubtaskById,
  updateSubtask,
  deleteSubtask,
  calculateTaskCompletion,
} from '@/lib/services/taskSubtaskService';
import { canEditTask } from '@/lib/services/taskPermissionService';

/**
 * PUT /api/tasks/[id]/subtasks/[subtaskId]
 * Update a subtask
 *
 * Request body (all fields optional):
 * {
 *   title?: string
 *   description?: string
 *   status?: 'todo' | 'in_progress' | 'done' | 'cancelled'
 *   assigned_to?: string (user ID)
 *   assigned_to_name?: string
 *   due_date?: string (ISO date)
 *   completion_percentage?: number (0-100)
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; subtaskId: string } }
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

    // 🔐 CHECK PERMISSION: Can user edit the task?
    const editPerm = await canEditTask(currentUserId, params.id);
    if (!editPerm.allowed) {
      return NextResponse.json(
        {
          error:
            editPerm.reason || 'Không có quyền cập nhật subtask này',
        },
        { status: 403 }
      );
    }

    // Verify subtask exists and belongs to task
    const subtask = await getSubtaskById(params.subtaskId);
    if (!subtask || subtask.task_id !== params.id) {
      return NextResponse.json(
        { error: 'Subtask không tìm thấy' },
        { status: 404 }
      );
    }

    // Update subtask
    const updated = await updateSubtask(params.subtaskId, {
      title: body.title,
      description: body.description,
      status: body.status,
      assigned_to: body.assigned_to,
      assigned_to_name: body.assigned_to_name,
      due_date: body.due_date,
      completion_percentage: body.completion_percentage,
    });

    // Recalculate parent task completion if status changed
    if (body.status !== undefined && body.status !== subtask.status) {
      const completion = await calculateTaskCompletion(params.id);
      console.log(
        `Task ${params.id} completion updated to ${completion}% due to subtask status change`
      );
    }

    console.log(
      `Subtask updated by ${currentUserId}: ${params.subtaskId}`
    );

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error(`PUT /api/tasks/[id]/subtasks/[subtaskId] error:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to update subtask',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]/subtasks/[subtaskId]
 * Delete a subtask
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; subtaskId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // 🔐 CHECK PERMISSION: Can user edit the task?
    const editPerm = await canEditTask(currentUserId, params.id);
    if (!editPerm.allowed) {
      return NextResponse.json(
        {
          error:
            editPerm.reason || 'Không có quyền xóa subtask này',
        },
        { status: 403 }
      );
    }

    // Verify subtask exists
    const subtask = await getSubtaskById(params.subtaskId);
    if (!subtask || subtask.task_id !== params.id) {
      return NextResponse.json(
        { error: 'Subtask không tìm thấy' },
        { status: 404 }
      );
    }

    // Delete subtask
    const rowCount = await deleteSubtask(params.subtaskId);

    if (rowCount === 0) {
      return NextResponse.json(
        { error: 'Subtask không tìm thấy' },
        { status: 404 }
      );
    }

    // Recalculate parent task completion
    const completion = await calculateTaskCompletion(params.id);
    console.log(
      `Subtask deleted by ${currentUserId}: ${params.subtaskId}. Task completion now ${completion}%`
    );

    return NextResponse.json({
      success: true,
      message: 'Subtask đã xóa thành công',
      deletedSubtaskId: params.subtaskId,
    });
  } catch (error) {
    console.error(
      `DELETE /api/tasks/[id]/subtasks/[subtaskId] error:`,
      error
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to delete subtask',
      },
      { status: 500 }
    );
  }
}
