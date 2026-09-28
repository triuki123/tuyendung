import { NextRequest, NextResponse } from 'next/server';
import {
  updateTimeEntry,
  deleteTimeEntry,
  permanentlyDeleteTimeEntry,
} from '@/lib/services/taskTimeService';
import { canEditTask } from '@/lib/services/taskPermissionService';
import { queryOne } from '@/lib/db';

/**
 * PUT /api/tasks/[id]/time-entries/[entryId]
 * Update a time entry
 *
 * Request body (all fields optional):
 * {
 *   duration_minutes?: number
 *   date_worked?: string (ISO date)
 *   description?: string
 *   is_billable?: boolean
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; entryId: string } }
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
            editPerm.reason || 'Không có quyền cập nhật time entry này',
        },
        { status: 403 }
      );
    }

    // Verify time entry exists and belongs to task
    const entry = await queryOne<any>(
      'SELECT * FROM task_time_entries WHERE id = $1 AND task_id = $2',
      [params.entryId, params.id]
    );

    if (!entry) {
      return NextResponse.json(
        { error: 'Time entry không tìm thấy' },
        { status: 404 }
      );
    }

    // Validate duration if provided
    if (body.duration_minutes !== undefined && body.duration_minutes <= 0) {
      return NextResponse.json(
        { error: 'Thời gian làm việc phải > 0' },
        { status: 400 }
      );
    }

    // Update time entry
    const updated = await updateTimeEntry(params.entryId, {
      duration_minutes: body.duration_minutes,
      date_worked: body.date_worked,
      description: body.description,
      is_billable: body.is_billable,
    });

    console.log(`Time entry updated by ${currentUserId}: ${params.entryId}`);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error(
      `PUT /api/tasks/[id]/time-entries/[entryId] error:`,
      error
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update time entry',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/[id]/time-entries/[entryId]
 * Delete a time entry (soft delete by default)
 *
 * Query parameters:
 * - permanent?: boolean (default: false) - hard delete (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; entryId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const isPermanent = searchParams.get('permanent') === 'true';

    // 🔐 CHECK PERMISSION: Can user edit the task?
    const editPerm = await canEditTask(currentUserId, params.id);
    if (!editPerm.allowed) {
      return NextResponse.json(
        {
          error:
            editPerm.reason || 'Không có quyền xóa time entry này',
        },
        { status: 403 }
      );
    }

    // Verify time entry exists
    const entry = await queryOne<any>(
      'SELECT * FROM task_time_entries WHERE id = $1 AND task_id = $2',
      [params.entryId, params.id]
    );

    if (!entry) {
      return NextResponse.json(
        { error: 'Time entry không tìm thấy' },
        { status: 404 }
      );
    }

    // Delete (soft or hard)
    let rowCount = 0;
    if (isPermanent) {
      rowCount = await permanentlyDeleteTimeEntry(params.entryId);
    } else {
      rowCount = await deleteTimeEntry(params.entryId);
    }

    if (rowCount === 0) {
      return NextResponse.json(
        { error: 'Time entry không tìm thấy' },
        { status: 404 }
      );
    }

    const deleteType = isPermanent ? 'permanent' : 'soft';
    console.log(
      `Time entry ${deleteType}-deleted by ${currentUserId}: ${params.entryId}`
    );

    return NextResponse.json({
      success: true,
      message: `Time entry đã ${
        isPermanent ? 'xóa vĩnh viễn' : 'xóa'
      } thành công`,
      deletedEntryId: params.entryId,
    });
  } catch (error) {
    console.error(
      `DELETE /api/tasks/[id]/time-entries/[entryId] error:`,
      error
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete time entry',
      },
      { status: 500 }
    );
  }
}
