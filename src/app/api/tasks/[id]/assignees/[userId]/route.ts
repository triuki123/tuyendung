import { NextRequest, NextResponse } from 'next/server';
import { removeAssignee } from '@/lib/services/taskAssigneeService';

/**
 * DELETE /api/tasks/{id}/assignees/{userId}
 * Remove an assignee from a task
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const currentUserId = request.headers.get('x-current-user-id');
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const taskId = params.id;
    const userId = params.userId;

    const rowsDeleted = await removeAssignee(taskId, userId);

    if (rowsDeleted === 0) {
      return NextResponse.json(
        { error: 'Assignee not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Assignee removed' });
  } catch (error) {
    console.error('DELETE /api/tasks/{id}/assignees/{userId} error:', error);
    return NextResponse.json({ error: 'Failed to remove assignee' }, { status: 500 });
  }
}
