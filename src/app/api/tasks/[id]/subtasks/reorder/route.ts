import { NextRequest, NextResponse } from 'next/server';
import {
  reorderSubtasks,
  getSubtasks,
} from '@/lib/services/taskSubtaskService';
import { canEditTask } from '@/lib/services/taskPermissionService';

/**
 * PATCH /api/tasks/[id]/subtasks/reorder
 * Reorder subtasks via drag-drop
 *
 * Request body:
 * {
 *   subtaskIds: string[] (array of subtask IDs in new order)
 * }
 */
export async function PATCH(
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

    // Validate request
    if (!Array.isArray(body.subtaskIds) || body.subtaskIds.length === 0) {
      return NextResponse.json(
        { error: 'subtaskIds phải là một mảng không rỗng' },
        { status: 400 }
      );
    }

    // 🔐 CHECK PERMISSION: Can user edit the task?
    const editPerm = await canEditTask(currentUserId, params.id);
    if (!editPerm.allowed) {
      return NextResponse.json(
        {
          error:
            editPerm.reason || 'Không có quyền sắp xếp lại subtasks',
        },
        { status: 403 }
      );
    }

    // Verify all subtasks belong to this task
    const existingSubtasks = await getSubtasks(params.id, true);
    const existingIds = new Set(existingSubtasks.map((s) => s.id));

    for (const subtaskId of body.subtaskIds) {
      if (!existingIds.has(subtaskId)) {
        return NextResponse.json(
          { error: `Subtask ${subtaskId} không thuộc task này` },
          { status: 400 }
        );
      }
    }

    // Reorder subtasks
    const reordered = await reorderSubtasks(params.id, body.subtaskIds);

    console.log(`Subtasks reordered by ${currentUserId} for task ${params.id}`);

    return NextResponse.json({
      success: true,
      data: reordered,
      message: 'Subtasks đã sắp xếp lại thành công',
    });
  } catch (error) {
    console.error(`PATCH /api/tasks/[id]/subtasks/reorder error:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to reorder subtasks',
      },
      { status: 500 }
    );
  }
}
